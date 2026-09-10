/**
 * Postgres embebido para probar en una máquina sin Postgres instalado.
 * Levanta PGlite hablando el protocolo de Postgres en un puerto TCP, así se
 * conectan Prisma y la API sin cambiar una línea de código.
 *
 *   npm run pg:local
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const puerto = Number(process.env.PGLITE_PUERTO ?? 5432);
const db = await PGlite.create({ dataDir: process.env.PGLITE_DIR ?? './.pglite' });
const servidor = new PGLiteSocketServer({ db, port: puerto, host: '127.0.0.1' });
await servidor.start();
console.log(`PGlite escuchando en 127.0.0.1:${puerto}`);

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await servidor.stop();
    await db.close();
    process.exit(0);
  });
}
