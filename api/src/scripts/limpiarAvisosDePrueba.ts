/**
 * Borra de la cola los avisos que quedaron de las pruebas, ANTES de conectar
 * n8n de verdad.
 *
 * Los datos de prueba apuntan a teléfonos inventados, y un número inventado
 * puede ser el de alguien real: no se le manda un WhatsApp a un desconocido
 * por una prueba nuestra.
 *
 * Sólo corre contra una base local.
 *
 *   npm run limpiar:avisos
 */
import { prisma } from '../infra/prisma/cliente.js';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Este script sólo corre contra una base local.');
  process.exit(1);
}

const pendientes = await prisma.eventoSaliente.findMany({
  where: { estado: 'PENDIENTE' },
  select: { id: true, tipo: true, payload: true },
});

const telefonoDe = (payload: unknown) =>
  (payload as { telefono?: string } | null)?.telefono ?? '(sin teléfono)';

console.log(`Avisos en la cola: ${pendientes.length}`);
for (const e of pendientes) {
  console.log(`  ${e.tipo.padEnd(22)} ${telefonoDe(e.payload)}`);
}

const { count } = await prisma.eventoSaliente.deleteMany({ where: { estado: 'PENDIENTE' } });
console.log(`\nBorrados: ${count}. La cola arranca limpia.`);

await prisma.$disconnect();
