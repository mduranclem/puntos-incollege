/**
 * Prueba manual del ciclo completo contra la base LOCAL.
 *
 * Lo que verifica, en orden:
 *
 *  1. un cobro en efectivo a alguien **sin cuenta en la app** no suma (D-059);
 *  2. el mismo cobro repetido no duplica nada (D-006);
 *  3. una vez registrado, el cobro siguiente sí acredita;
 *  4. lo de antes no se recupera: el saldo es sólo lo de después de la cuenta.
 *
 * Antes movía el cierre de temporada al pasado para probar el vencimiento. Los
 * puntos no vencen (D-058): no hay ciclo que cerrar.
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

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Este script sólo corre contra una base local.');
  process.exit(1);
}

const TELEFONO = '3415550001';
const ing = new IngestorDePagos(prisma, new MotorDePuntos(new RepositorioPrisma(prisma)));

const cobrar = (referencia: string) =>
  ing.ingerir({
    referenciaExterna: referencia,
    ocurridoEn: new Date(),
    importeCentavos: 3_000_000n,
    medioDePago: 'EFECTIVO',
    lineaDeNegocio: 'UNIFORMES',
    localCodigo: 'ROS-SUR',
    cliente: { telefonoCrudo: TELEFONO, nombre: 'Cuenta de prueba' },
  });

const sinCuenta = await cobrar('manual:antes-de-la-cuenta');
console.log(
  '1. sin cuenta en la app →',
  `acredito: ${sinCuenta.acredito} · motivo: ${sinCuenta.motivoSinPuntos} ·`,
  `puntos: ${sinCuenta.puntosAcreditados} · saldo: ${sinCuenta.saldoPuntos}`,
);

const repetido = await cobrar('manual:antes-de-la-cuenta');
console.log('2. el mismo cobro otra vez → yaAplicado:', repetido.yaAplicado);

await prisma.cliente.update({
  where: { id: sinCuenta.clienteId },
  data: { registradoEn: new Date(), email: `prueba-${Date.now()}@ejemplo.com` },
});
console.log('   (se registra en la app)');

const conCuenta = await cobrar('manual:ya-con-cuenta');
console.log(
  '3. con cuenta →',
  `acredito: ${conCuenta.acredito} · motivo: ${conCuenta.motivoSinPuntos} ·`,
  `puntos: ${conCuenta.puntosAcreditados} · saldo: ${conCuenta.saldoPuntos}`,
);

const pagos = await prisma.pago.findMany({
  where: { clienteId: sinCuenta.clienteId },
  orderBy: { creadoEn: 'asc' },
  select: { referenciaExterna: true, estado: true, importeCentavos: true },
});
console.log('4. los dos cobros quedaron registrados:');
for (const p of pagos) {
  console.log(`   ${p.referenciaExterna.padEnd(28)} ${p.estado}`);
}
const movs = await prisma.movimiento.findMany({
  where: { cuenta: { clienteId: sinCuenta.clienteId } },
  orderBy: { secuencia: 'asc' },
  select: { tipo: true, puntos: true },
});
console.log('   libro mayor:', movs.map((m) => `${m.tipo} ${m.puntos}`).join(' | ') || '(vacío)');

await prisma.$disconnect();
