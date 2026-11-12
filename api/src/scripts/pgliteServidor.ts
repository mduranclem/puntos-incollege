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

/**
 * Un cliente que corta la conexión de golpe llega acá como `ECONNRESET` sin
 * dueño, y eso se llevaba puesto al servidor entero: el siguiente comando veía
 * "Can't reach database server" y el error no decía nada de la causa. Prisma
 * abre y cierra conexiones de prueba todo el tiempo, así que pasa seguido.
 *
 * Se avisa y se sigue. Es un servidor de desarrollo: que sobreviva a un cliente
 * maleducado es exactamente lo que se le pide.
 */
const esCorteDeCliente = (error: unknown) =>
  ['ECONNRESET', 'EPIPE', 'ECANCELED'].includes((error as { code?: string })?.code ?? '');

process.on('uncaughtException', (error) => {
  if (!esCorteDeCliente(error)) throw error;
  console.warn(`PGlite: un cliente cortó la conexión (${(error as { code?: string }).code})`);
});
process.on('unhandledRejection', (error) => {
  if (!esCorteDeCliente(error)) throw error;
  console.warn(`PGlite: un cliente cortó la conexión (${(error as { code?: string }).code})`);
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    await servidor.stop();
    await db.close();
    process.exit(0);
  });
}
