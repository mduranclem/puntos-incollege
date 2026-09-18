/**
 * Prueba del acceso propio del cliente contra la base LOCAL (D-022): pedir el
 * código, leerlo de la cola de avisos, confirmarlo y ver la cuenta. Además
 * comprueba las defensas: código equivocado, reutilización y expiración.
 *
 * Toca datos, así que se niega a correr si DATABASE_URL no es local.
 *
 *   npm run pg:local        (en otra terminal)
 *   npm run probar:acceso
 */
import { prisma } from '../infra/prisma/cliente.js';
import { confirmarCodigo, pedirCodigo } from '../servicios/accesoCliente.js';
import { verificarTokenCliente } from '../servicios/tokenCliente.js';
import { resumenDeCuenta } from '../servicios/saldos.js';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Este script sólo corre contra una base local.');
  process.exit(1);
}

const ok = (texto: string) => console.log(`  \x1b[32m✓\x1b[0m ${texto}`);
const titulo = (texto: string) => console.log(`\n\x1b[1m${texto}\x1b[0m`);

const cliente = await prisma.cliente.findFirstOrThrow({ where: { fusionadoEnId: null } });
console.log(`Cuenta de prueba: ${cliente.nombre} · ${cliente.telefonoE164}`);

titulo('1. Pide el código escribiendo el teléfono de cualquier forma');
const pedido = await pedirCodigo(prisma, cliente.telefonoE164.replace('+549', '0') + '');
ok(`normalizó a ${pedido.telefonoE164} y lo muestra como ${pedido.telefonoLindo}`);

const evento = await prisma.eventoSaliente.findFirstOrThrow({
  where: { tipo: 'acceso.codigo' },
  orderBy: { creadoEn: 'desc' },
});
const codigo = (evento.payload as { codigo: string }).codigo;
ok(`el código salió por la cola de n8n, no por la respuesta HTTP`);

titulo('2. Un código equivocado no entra');
try {
  await confirmarCodigo(prisma, cliente.telefonoE164, '000000');
  console.log('  ✗ ENTRÓ CON UN CÓDIGO EQUIVOCADO');
} catch (error) {
  ok(`rechazado: ${(error as Error).message}`);
}

titulo('3. El código correcto sí');
const acceso = await confirmarCodigo(prisma, cliente.telefonoE164, codigo);
const contenido = verificarTokenCliente(acceso.token);
ok(`token válido para ${acceso.nombre} (sub ${contenido?.sub.slice(0, 8)}…)`);

const cuenta = await resumenDeCuenta(prisma, acceso.clienteId, 5);
ok(`ve su cuenta: ${cuenta.saldoPuntos} punto(s) = ${cuenta.equivalenteTexto}`);
ok(`y sus ${cuenta.movimientos.length} últimos movimientos`);

titulo('4. El mismo código no sirve dos veces');
try {
  await confirmarCodigo(prisma, cliente.telefonoE164, codigo);
  console.log('  ✗ EL CÓDIGO SE PUDO REUSAR');
} catch (error) {
  ok(`rechazado: ${(error as Error).message}`);
}

titulo('5. Un código vencido tampoco');
const pedidoVencido = await pedirCodigo(prisma, cliente.telefonoE164);
const eventoVencido = await prisma.eventoSaliente.findFirstOrThrow({
  where: { tipo: 'acceso.codigo' },
  orderBy: { creadoEn: 'desc' },
});
await prisma.codigoDeAcceso.updateMany({
  where: { telefonoE164: pedidoVencido.telefonoE164, usadoEn: null },
  data: { expiraEn: new Date(Date.now() - 1000) },
});
try {
  await confirmarCodigo(
    prisma,
    cliente.telefonoE164,
    (eventoVencido.payload as { codigo: string }).codigo,
  );
  console.log('  ✗ ENTRÓ CON UN CÓDIGO VENCIDO');
} catch (error) {
  ok(`rechazado: ${(error as Error).message}`);
}

titulo('6. Un teléfono sin cuenta no revela nada');
const desconocido = await pedirCodigo(prisma, '3419990000');
const codigosDelDesconocido = await prisma.codigoDeAcceso.count({
  where: { telefonoE164: desconocido.telefonoE164 },
});
ok(`respondió ${JSON.stringify({ enviado: desconocido.enviado })} igual que con un cliente`);
ok(`y no generó ningún código (${codigosDelDesconocido})`);

console.log('\nListo.');
await prisma.$disconnect();
