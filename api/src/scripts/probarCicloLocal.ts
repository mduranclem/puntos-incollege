/**
 * Prueba manual del ciclo completo contra la base LOCAL: carga un cobro en
 * efectivo, muestra el libro mayor que quedó y los avisos encolados.
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

const ing = new IngestorDePagos(prisma, new MotorDePuntos(new RepositorioPrisma(prisma)));
const r = await ing.ingerir({
  referenciaExterna: 'manual:prueba-1',
  ocurridoEn: new Date(),
  importeCentavos: 3_000_000n,
  medioDePago: 'EFECTIVO',
  lineaDeNegocio: 'UNIFORMES',
  localCodigo: 'ROS-SUR',
  cliente: { telefonoCrudo: '3415550001', nombre: 'Cuenta de prueba' },
});
console.log('acreditado:', r.puntosAcreditados, 'puntos · saldo:', r.saldoPuntos);

console.log('segunda corrida (idempotencia):', (await ing.ingerir({
  referenciaExterna: 'manual:prueba-1',
  ocurridoEn: new Date(),
  importeCentavos: 3_000_000n,
  medioDePago: 'EFECTIVO',
  lineaDeNegocio: 'UNIFORMES',
  localCodigo: 'ROS-SUR',
  cliente: { telefonoCrudo: '3415550001', nombre: 'Cuenta de prueba' },
})).yaAplicado);

const cuenta = await prisma.cuentaPuntos.findFirstOrThrow({ orderBy: { creadoEn: 'desc' } });
console.log('saldo cacheado:', cuenta.saldoCacheado, '· remanente:', cuenta.remanenteCentavos.toString());
const movs = await prisma.movimiento.findMany({ orderBy: { secuencia: 'asc' }, select: { tipo: true, puntos: true } });
console.log('libro mayor:', movs.map((m) => `${m.tipo} ${m.puntos}`).join(' | '));
const ev = await prisma.eventoSaliente.groupBy({ by: ['tipo'], _count: { _all: true } });
console.log('avisos encolados:', ev.map((e) => `${e.tipo}: ${e._count._all}`).join(' · '));
await prisma.$disconnect();
