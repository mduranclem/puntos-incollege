/**
 * Prueba de concurrencia del canje contra un PostgreSQL de verdad (D-007).
 *
 * Existe porque `tests/integracionPostgres.test.ts` necesita vitest y las
 * dependencias de desarrollo, que no viajan en la imagen de producción. Esto es
 * el mismo control, compilado, para poder correrlo desde la consola del servicio
 * en EasyPanel — donde está el único PostgreSQL que acepta varias conexiones.
 *
 * Usa el motor y el repositorio reales: el mismo camino que usa el mostrador.
 *
 * Escribe en el esquema que le indique la URL. **Apuntalo a un esquema aparte**,
 * nunca a `public`: el libro mayor es append-only y lo que entra no se borra.
 *
 *   DATABASE_URL_TEST="postgres://...?schema=pruebas" node dist/scripts/probarConcurrencia.js
 */
import { PrismaClient } from '@prisma/client';
import { MotorDePuntos } from '../motor/motorPuntos.js';
import { RepositorioPrisma } from '../infra/prisma/repositorioPrisma.js';
import { parsearImporte } from '../dominio/dinero.js';

const URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!URL) {
  console.error('Falta DATABASE_URL_TEST.');
  process.exit(1);
}
if (!/[?&]schema=/.test(URL) || /[?&]schema=public(&|$)/.test(URL)) {
  console.error(
    'Esta prueba escribe movimientos y no se pueden borrar (D-004).\n' +
      'Pasá una URL con un esquema aparte, por ejemplo ...?schema=pruebas',
  );
  process.exit(1);
}

const CENTAVOS_POR_PUNTO = parsearImporte('10000'); // $10.000 = 1 punto
const VALOR_PUNTO = parsearImporte('1000'); // 1 punto = $1.000
const SIN_TOPE = 10_000; // 100% en puntos básicos (D-025)
const contexto = { usuarioId: null, localId: null };

const prisma = new PrismaClient({ datasources: { db: { url: URL } } });
const motor = new MotorDePuntos(new RepositorioPrisma(prisma));

let fallas = 0;
function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  console.log(`  ${condicion ? '✓' : '✗'} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallas++;
}

async function prepararCuenta() {
  const local = await prisma.local.upsert({
    where: { codigo: 'PRUEBA-CONCURRENCIA' },
    update: {},
    create: {
      codigo: 'PRUEBA-CONCURRENCIA',
      nombre: 'Local de prueba',
      codigoAreaPorDefecto: '341',
    },
  });
  const temporada = await prisma.temporada.upsert({
    where: { nombre: 'Temporada de prueba' },
    update: {},
    create: {
      nombre: 'Temporada de prueba',
      inicioEn: new Date('2000-01-01'),
      cierreEn: new Date('2999-12-31'),
    },
  });
  // Teléfono inventado a propósito dentro del esquema de pruebas, que no manda
  // avisos: el despachador corre contra `public`.
  const cliente = await prisma.cliente.create({
    data: {
      telefonoE164: `+549341${Date.now().toString().slice(-7)}`,
      telefonoCrudo: 'prueba',
      nombre: 'Cuenta de prueba',
      localOrigenId: local.id,
    },
  });
  const cuenta = await prisma.cuentaPuntos.create({
    data: { clienteId: cliente.id, temporadaId: temporada.id },
  });
  return cuenta.id;
}

async function idempotencia(cuentaId: string) {
  console.log('\nIdempotencia: el mismo pago no se acredita dos veces (D-006)');
  const referencia = `manual:prueba-${Date.now()}`;
  const acreditar = () =>
    motor.acreditar({
      cuentaId,
      referenciaExterna: referencia,
      importeCentavos: parsearImporte('25000'),
      centavosPorPunto: CENTAVOS_POR_PUNTO,
      contexto,
    });

  const primero = await acreditar();
  const reintento = await acreditar();
  // $25.000 con $10.000 por punto: 2 puntos y $5.000 de remanente (D-005).
  comprobar('el primer intento acredita 2 puntos', primero.movimiento?.puntos === 2);
  comprobar('el reintento avisa que ya estaba', reintento.yaAplicado === true);

  const cuantos = await prisma.movimiento.count({
    where: { tipo: 'ACREDITACION', referenciaExterna: referencia },
  });
  comprobar('quedó un solo movimiento', cuantos === 1, `hay ${cuantos}`);
}

/**
 * El control que importa: varias operaciones peleando por el mismo saldo.
 * Diez canjes simultáneos de todo el saldo. Con el bloqueo de fila puesto, gana
 * uno solo; sin él, dos o más se cruzan y la cuenta queda en negativo.
 */
async function concurrencia(cuentaId: string) {
  console.log('\nConcurrencia: diez canjes simultáneos por el mismo saldo (D-007)');
  await motor.acreditar({
    cuentaId,
    referenciaExterna: `manual:carga-${Date.now()}`,
    importeCentavos: parsearImporte('300000'), // 30 puntos
    centavosPorPunto: CENTAVOS_POR_PUNTO,
    contexto,
  });

  const saldoAntes = (await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } }))
    .saldoCacheado;
  console.log(`  saldo antes: ${saldoAntes} puntos`);

  const canje = (n: number) =>
    motor.canjear({
      cuentaId,
      puntosPedidos: saldoAntes,
      totalVentaCentavos: parsearImporte('10000000'),
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: SIN_TOPE,
      beneficiosAplicados: [],
      referenciaExterna: `venta:concurrencia-${Date.now()}-${n}`,
      contexto,
    });

  const resultados = await Promise.allSettled(
    Array.from({ length: 10 }, (_, n) => canje(n)),
  );
  const ganaron = resultados.filter((r) => r.status === 'fulfilled').length;
  const perdieron = resultados.length - ganaron;
  comprobar('gana exactamente uno', ganaron === 1, `ganaron ${ganaron}, perdieron ${perdieron}`);

  const cuenta = await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } });
  comprobar('el saldo quedó en cero', cuenta.saldoCacheado === 0, `${cuenta.saldoCacheado}`);
  comprobar('el saldo nunca queda negativo', cuenta.saldoCacheado >= 0);

  const motivos = resultados
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason as { codigo?: string; message?: string }).codigo ?? r.reason?.message);
  console.log(`  los que perdieron: ${[...new Set(motivos)].join(', ')}`);
}

async function cacheCoincide(cuentaId: string) {
  console.log('\nLa caché del saldo coincide con la suma del libro mayor (D-004)');
  const suma = await prisma.movimiento.aggregate({ where: { cuentaId }, _sum: { puntos: true } });
  const cuenta = await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } });
  comprobar(
    'saldoCacheado == SUM(puntos)',
    cuenta.saldoCacheado === (suma._sum.puntos ?? 0),
    `caché ${cuenta.saldoCacheado}, suma ${suma._sum.puntos ?? 0}`,
  );
}

const cuentaId = await prepararCuenta();
await idempotencia(cuentaId);
await concurrencia(cuentaId);
await cacheCoincide(cuentaId);
await prisma.$disconnect();

console.log(fallas === 0 ? '\nTodo en orden.' : `\n${fallas} control(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
