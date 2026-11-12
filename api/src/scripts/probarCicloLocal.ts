/**
 * Prueba manual del ciclo completo contra la base LOCAL.
 *
 * Lo que verifica, en orden:
 *
 *  1. un cobro a un teléfono **sin cuenta en la app** se rechaza y no deja nada:
 *     ni ficha de cliente ni pago (D-060);
 *  2. con cuenta, el mismo cobro en efectivo acredita;
 *  3. repetirlo no acredita dos veces (D-006);
 *  4. con tarjeta se registra pero no suma (D-001);
 *  5. el recargo por forma de pago se cobra y queda desglosado en el pago, y no
 *     cambia los puntos (D-061);
 *  6. el libro mayor queda con un solo movimiento: lo de antes de la cuenta no
 *     aparece por ningún lado, porque nunca entró.
 *
 * Modifica datos: se niega a correr si DATABASE_URL no apunta a localhost.
 *
 *   npm run pg:local        (en otra terminal)
 *   npm run probar:local
 */
import { prisma } from '../infra/prisma/cliente.js';
import { MotorDePuntos } from '../motor/motorPuntos.js';
import { RepositorioPrisma } from '../infra/prisma/repositorioPrisma.js';
import { IngestorDePagos } from '../motor/ingestor.js';
import { normalizarTelefono } from '../dominio/telefono.js';
import { conRecargo, formaDePagoVigente } from '../servicios/formasDePago.js';
import { formatearPesos } from '../dominio/dinero.js';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Este script sólo corre contra una base local.');
  process.exit(1);
}

const TELEFONO = '3415550001';
const E164 = normalizarTelefono(TELEFONO, { areaPorDefecto: '341' });
const ing = new IngestorDePagos(prisma, new MotorDePuntos(new RepositorioPrisma(prisma)));

/** $30.000 de lista: con la tasa del seed son 3 puntos en efectivo. */
const BASE = 3_000_000n;

const cobrar = (referencia: string, medioDePago: 'EFECTIVO' | 'TARJETA_CREDITO' = 'EFECTIVO') =>
  ing.ingerir({
    referenciaExterna: referencia,
    ocurridoEn: new Date(),
    importeCentavos: BASE,
    medioDePago,
    lineaDeNegocio: 'UNIFORMES',
    localCodigo: 'ROS-SUR',
    cliente: { telefonoCrudo: TELEFONO, nombre: 'Cuenta de prueba' },
  });

/** Igual que el mostrador: la forma de pago decide el medio y el recargo (D-061). */
const cobrarCon = async (referencia: string, codigoDeForma: string) => {
  const forma = await formaDePagoVigente(prisma, codigoDeForma);
  const importe = conRecargo(forma, BASE);
  const resultado = await ing.ingerir({
    referenciaExterna: referencia,
    ocurridoEn: new Date(),
    importeCentavos: importe.totalCentavos,
    medioDePago: forma.medioDePago,
    lineaDeNegocio: 'UNIFORMES',
    localCodigo: 'ROS-SUR',
    recargo: {
      formaDePagoCodigo: forma.codigo,
      bps: forma.recargoBps,
      centavos: importe.recargoCentavos,
    },
    cliente: { telefonoCrudo: TELEFONO, nombre: 'Cuenta de prueba' },
  });
  return { forma, importe, resultado };
};

// Se parte de cero para que la prueba diga algo: si la ficha quedó de una
// corrida anterior, el primer paso no probaría nada.
await prisma.$executeRawUnsafe(
  `DELETE FROM "Movimiento" WHERE "cuentaId" IN (
     SELECT c.id FROM "CuentaPuntos" c JOIN "Cliente" cl ON cl.id = c."clienteId"
     WHERE cl."telefonoE164" = $1)`,
  E164,
);
await prisma.$executeRawUnsafe(
  `DELETE FROM "Pago" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE "telefonoE164" = $1)`,
  E164,
);
await prisma.$executeRawUnsafe(
  `DELETE FROM "CuentaPuntos" WHERE "clienteId" IN (SELECT id FROM "Cliente" WHERE "telefonoE164" = $1)`,
  E164,
);
await prisma.$executeRawUnsafe(`DELETE FROM "Cliente" WHERE "telefonoE164" = $1`, E164);

try {
  await cobrar('manual:sin-cuenta');
  console.log('1. sin cuenta → NO SE RECHAZÓ (mal)');
} catch (error) {
  const codigo = (error as { codigo?: string }).codigo ?? '(sin código)';
  console.log(`1. sin cuenta → rechazado: ${codigo}`);
}
console.log(
  '   no quedó nada:',
  `clientes con ese teléfono: ${await prisma.cliente.count({ where: { telefonoE164: E164 } })} ·`,
  `pagos: ${await prisma.pago.count({ where: { referenciaExterna: 'manual:sin-cuenta' } })}`,
);

const cliente = await prisma.cliente.create({
  data: {
    telefonoE164: E164,
    telefonoCrudo: TELEFONO,
    nombre: 'Cuenta de prueba',
    email: `prueba-${Date.now()}@ejemplo.com`,
    contrasenaHash: 'x',
    registradoEn: new Date(),
  },
});
console.log('   (la persona se registra en la app)');

const efectivo = await cobrar('manual:con-cuenta');
console.log(
  `2. en efectivo → acredito: ${efectivo.acredito} ·`,
  `puntos: ${efectivo.puntosAcreditados} · saldo: ${efectivo.saldoPuntos}`,
);
console.log('3. el mismo cobro otra vez → yaAplicado:', (await cobrar('manual:con-cuenta')).yaAplicado);

const tarjeta = await cobrar('manual:con-tarjeta', 'TARJETA_CREDITO');
console.log(`4. con tarjeta → acredito: ${tarjeta.acredito} · saldo: ${tarjeta.saldoPuntos}`);

// Recargo: la misma venta, pagada en seis cuotas.
const seis = await cobrarCon('manual:credito-6', 'credito-6');
console.log(
  `5. ${seis.forma.nombre} (${seis.forma.recargoBps / 100}%) →`,
  `lista ${formatearPesos(seis.importe.baseCentavos)} +`,
  `recargo ${formatearPesos(seis.importe.recargoCentavos)} =`,
  `${formatearPesos(seis.importe.totalCentavos)}`,
);
const guardado = await prisma.pago.findUniqueOrThrow({
  where: { referenciaExterna: 'manual:credito-6' },
  select: { importeCentavos: true, recargoCentavos: true, recargoBps: true, formaDePagoCodigo: true },
});
console.log(
  `   guardado: ${formatearPesos(guardado.importeCentavos)} ·`,
  `recargo ${formatearPesos(guardado.recargoCentavos)} (${guardado.recargoBps / 100}%) ·`,
  `forma ${guardado.formaDePagoCodigo}`,
);
console.log(
  `   los puntos no cambian: saldo ${seis.resultado.saldoPuntos} ·`,
  `acredito: ${seis.resultado.acredito}`,
);

const pagos = await prisma.pago.findMany({
  where: { clienteId: cliente.id },
  orderBy: { creadoEn: 'asc' },
  select: { referenciaExterna: true, estado: true, importeCentavos: true },
});
console.log('6. pagos registrados:');
for (const p of pagos) {
  console.log(`   ${p.referenciaExterna.padEnd(22)} ${p.estado.padEnd(15)} ${formatearPesos(p.importeCentavos)}`);
}
const movs = await prisma.movimiento.findMany({
  where: { cuenta: { clienteId: cliente.id } },
  orderBy: { secuencia: 'asc' },
  select: { tipo: true, puntos: true },
});
console.log('   libro mayor:', movs.map((m) => `${m.tipo} ${m.puntos}`).join(' | ') || '(vacío)');

await prisma.$disconnect();
