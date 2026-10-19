/**
 * Deja una sola cuenta de gerencia y borra todas las demás.
 *
 * El caso es el primer día de verdad: la base viene con las cuentas del seed
 * —`admin` y las seis `mostrador-*`, más lo que hayan dejado las pruebas— con
 * contraseñas que varias personas vieron. Se arranca con una gerencia sola, y
 * esa gerencia da de alta al resto desde el panel (D-034).
 *
 * La cuenta que se queda **se nombra a mano**. No se adivina: la regla "sobrevive
 * quien puso su propia contraseña" dejaba en pie al `admin` del seed si alguien
 * ya se la había cambiado, que es exactamente la cuenta que hay que sacar.
 *
 *   npm run cuentas:cero                              # informe, no toca nada
 *   npm run cuentas:cero -- --dejar=mateo              # informe de ese plan
 *   npm run cuentas:cero -- --dejar=mateo --confirmar  # ejecuta
 *   npm run cuentas:cero:prod -- --dejar=mateo --confirmar
 *
 * **Se borran de verdad.** `Usuario` tiene pagos, movimientos, configuraciones y
 * precios colgados, pero las cuatro referencias son opcionales (`usuarioId
 * String?`), así que al borrar quedan en `null`: las filas del libro mayor no se
 * van —D-004 sigue en pie— sólo pierden el autor. Lo decidió el dueño sabiéndolo,
 * porque las cuentas de arranque y esos movimientos eran todos de prueba.
 *
 * Si algún día hay que dar de baja a una persona real que cobró de verdad, esto
 * NO es el script: es `activo: false` desde el panel, para no perder quién hizo
 * cada cobro.
 */
import { prisma } from '../infra/prisma/cliente.js';

const confirmar = process.argv.includes('--confirmar');
const dejar = process.argv
  .find((a) => a.startsWith('--dejar='))
  ?.slice('--dejar='.length)
  .toLowerCase()
  .trim();

const url = process.env.DATABASE_URL ?? '';
const esLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
console.log(`Base: ${esLocal ? 'base local' : (url.match(/@([^:/?]+)/)?.[1] ?? 'desconocida')}`);
if (!esLocal) console.log('⚠  Esto NO es una base local. Mirá el informe antes de confirmar.');
console.log('');

const usuarios = await prisma.usuario.findMany({
  select: {
    id: true,
    usuario: true,
    nombre: true,
    rol: true,
    activo: true,
    debeCambiarContrasena: true,
    local: { select: { nombre: true } },
    _count: {
      select: { pagos: true, movimientos: true, configuraciones: true, preciosEditados: true },
    },
  },
  orderBy: { creadoEn: 'asc' },
});

const historia = (u: (typeof usuarios)[number]) =>
  u._count.pagos + u._count.movimientos + u._count.configuraciones + u._count.preciosEditados;

const elegida = dejar ? usuarios.find((u) => u.usuario === dejar) : undefined;
const aBorrar = usuarios.filter((u) => u.id !== elegida?.id);
/** Filas que van a quedar sin autor. El libro mayor queda, la firma no. */
const huerfanas = aBorrar.reduce((t, u) => t + historia(u), 0);

console.log(`Cuentas: ${usuarios.length}`);
for (const u of usuarios) {
  const h = historia(u);
  const detalle =
    h === 0
      ? 'sin historia'
      : `${u._count.movimientos} mov, ${u._count.pagos} pagos, ` +
        `${u._count.configuraciones} config, ${u._count.preciosEditados} precios`;
  const destino =
    u.id === elegida?.id
      ? '✓ SE QUEDA'
      : h === 0
        ? '→ se borra'
        : `→ se borra (${h} filas quedan sin autor)`;
  console.log(
    `  ${u.usuario.padEnd(22)} ${u.rol.padEnd(9)} ${(u.local?.nombre ?? '-').padEnd(20)} ` +
      `${detalle.padEnd(46)} ${destino}`,
  );
}

/* ------------------------------------------------------------------ los frenos */

const basta = (mensaje: string) => {
  console.log(`\n──\nNo se tocó nada.\n\n${mensaje}`);
  return prisma.$disconnect().then(() => process.exit(0));
};

if (!dejar) {
  await basta(
    'Falta decir qué cuenta se queda. Se borra todo lo demás, así que la elegís vos:\n\n' +
      '  npm run cuentas:cero -- --dejar=<usuario>\n\n' +
      'Tiene que ser una cuenta de rol GERENTE, activa, y que ya haya puesto su propia\n' +
      'contraseña. Si todavía no existe, creala primero desde el panel con el `admin`,\n' +
      'que entre una vez y la ponga, y recién después corré esto.',
  );
}

if (!elegida) {
  await basta(
    `No hay ninguna cuenta con usuario "${dejar}". Mirá la lista de arriba: el nombre\n` +
      'tiene que coincidir exacto.',
  );
}

if (elegida!.rol !== 'GERENTE') {
  await basta(
    `"${elegida!.usuario}" es ${elegida!.rol}, no GERENTE. Sin gerencia no se pueden dar de\n` +
      'alta los demás usuarios ni editar precios, y quedarías sin forma de entrar a eso.',
  );
}

if (!elegida!.activo) {
  await basta(`"${elegida!.usuario}" está inactiva: no podría entrar. Activala primero.`);
}

if (elegida!.debeCambiarContrasena) {
  await basta(
    `"${elegida!.usuario}" todavía tiene la contraseña que le puso otro, así que el servidor\n` +
      'le devuelve 403 en todo lo que opera hasta que ponga una propia (D-034). Que entre\n' +
      'una vez, la cambie, y volvé a correr esto. Si no, te quedás sin ninguna cuenta útil.',
  );
}

console.log(`\nSe queda 1: ${elegida!.usuario} (${elegida!.rol}). Se borran ${aBorrar.length}.`);
if (huerfanas > 0) {
  console.log(
    `\n⚠  ${huerfanas} filas (movimientos, pagos, configuración o precios) van a quedar\n` +
      '   sin autor. Las filas NO se borran: el libro mayor queda entero, pero deja de\n' +
      '   decir quién las hizo. Eso no se puede deshacer.',
  );
}

/* -------------------------------------------------------------------- hacerlo */

if (!confirmar) {
  console.log(
    '\n──\nInforme solamente. No se tocó nada.\n' +
      `Para ejecutarlo: npm run cuentas:cero -- --dejar=${elegida!.usuario} --confirmar`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

const { count } = await prisma.usuario.deleteMany({
  where: { id: { in: aBorrar.map((u) => u.id) } },
});

console.log(
  `\n──\nBorradas: ${count}.\n` +
    `Queda en pie: ${elegida!.usuario} (${elegida!.rol}).\n` +
    'Desde esa cuenta se dan de alta los demás, y cada uno pone su contraseña al entrar.',
);

await prisma.$disconnect();
