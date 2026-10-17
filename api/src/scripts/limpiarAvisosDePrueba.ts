/**
 * Deja la cola de avisos lista para producción.
 *
 * Los datos de prueba apuntan a teléfonos inventados, y un número inventado
 * puede ser el de alguien real: no se le manda un WhatsApp a un desconocido
 * por una prueba nuestra. Por eso esto se corre ANTES de poner
 * `CRON_HABILITADO=true`, no después.
 *
 * Por defecto **sólo informa**. No borra nada hasta que se lo pidan:
 *
 *   npm run limpiar:avisos                  # informe, no toca nada
 *   npm run limpiar:avisos -- --confirmar   # vacía la cola
 *
 * En producción va la versión compilada, igual que `precios:prod`:
 *
 *   npm run limpiar:avisos:prod -- --confirmar
 *
 * Lo que **nunca** toca: clientes, cuentas y movimientos. El libro mayor es
 * append-only (D-004) y un cliente no se borra ni aunque haya nacido de una
 * prueba: si tiene movimientos, borrarlo dejaría el libro sin dueño. Los lista
 * para que la decisión la tome una persona.
 */
import { prisma } from '../infra/prisma/cliente.js';

const confirmar = process.argv.includes('--confirmar');

const url = process.env.DATABASE_URL ?? '';
const esLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
const dondeEstoy = esLocal ? 'base local' : (url.match(/@([^:/?]+)/)?.[1] ?? 'base desconocida');

console.log(`Base: ${dondeEstoy}`);
if (!esLocal) {
  console.log('⚠  Esto NO es una base local. Mirá el informe antes de confirmar.');
}
console.log('');

/* ---------------------------------------------------------------- la cola */

const telefonoDe = (payload: unknown) =>
  (payload as { telefono?: string } | null)?.telefono ?? '(sin teléfono)';

const porEstado = await prisma.eventoSaliente.groupBy({
  by: ['estado'],
  _count: { _all: true },
});

console.log('Cola de avisos (EventoSaliente)');
if (porEstado.length === 0) {
  console.log('  vacía.');
} else {
  for (const fila of porEstado) {
    console.log(`  ${fila.estado.padEnd(10)} ${fila._count._all}`);
  }
}

const encolados = await prisma.eventoSaliente.findMany({
  where: { estado: { in: ['PENDIENTE', 'FALLIDO'] } },
  select: { tipo: true, estado: true, payload: true, creadoEn: true },
  orderBy: { creadoEn: 'asc' },
});

if (encolados.length > 0) {
  console.log('\n  Los que saldrían o fallaron:');
  for (const e of encolados) {
    const cuando = e.creadoEn.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`    ${cuando}  ${e.estado.padEnd(10)} ${e.tipo.padEnd(22)} ${telefonoDe(e.payload)}`);
  }
}

/* ------------------------------------------------------------- los códigos */

const codigos = await prisma.codigoDeAcceso.count({
  where: { usadoEn: null, expiraEn: { gt: new Date() } },
});
console.log(`\nCódigos de acceso vivos: ${codigos}`);

/* ------------------------------------------------------------- los clientes */

const clientes = await prisma.cliente.findMany({
  select: {
    nombre: true,
    telefonoE164: true,
    creadoEn: true,
    cuentas: { select: { saldoCacheado: true, _count: { select: { movimientos: true } } } },
  },
  orderBy: { creadoEn: 'asc' },
});

console.log(`\nClientes: ${clientes.length}`);
for (const c of clientes) {
  const movs = c.cuentas.reduce((t, cu) => t + cu._count.movimientos, 0);
  const saldo = c.cuentas.reduce((t, cu) => t + cu.saldoCacheado, 0);
  const cuando = c.creadoEn.toISOString().slice(0, 10);
  const marca = movs === 0 ? '  ← sin movimientos' : '';
  console.log(
    `  ${cuando}  ${c.telefonoE164.padEnd(16)} ${String(movs).padStart(3)} mov  ` +
      `${String(saldo).padStart(5)} pts  ${c.nombre}${marca}`,
  );
}
console.log(
  '\n  Los clientes NO se borran (D-004): si tienen movimientos, el libro mayor\n' +
    '  quedaría sin dueño. Revisá la lista y decidí vos qué hacer con los de prueba.',
);

/* ------------------------------------------------------------------ borrar */

const aBorrar = encolados.length;

if (!confirmar) {
  console.log(
    `\n──\nInforme solamente. No se tocó nada.` +
      (aBorrar > 0
        ? `\nPara vaciar la cola (${aBorrar} avisos): volvé a correrlo con --confirmar`
        : `\nLa cola ya está limpia: no hay nada que vaciar.`),
  );
} else if (aBorrar === 0) {
  console.log('\n──\nLa cola ya estaba limpia. No se borró nada.');
} else {
  const { count } = await prisma.eventoSaliente.deleteMany({
    where: { estado: { in: ['PENDIENTE', 'FALLIDO'] } },
  });
  console.log(`\n──\nBorrados de la cola: ${count}. Arranca limpia.`);
}

await prisma.$disconnect();
