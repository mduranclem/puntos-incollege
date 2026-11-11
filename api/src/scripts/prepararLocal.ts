/**
 * Prepara la base LOCAL en una sola conexión: aplica la migración inicial y el
 * seed. Sirve para el Postgres embebido (D-018), que acepta un cliente por vez.
 *
 *   npm run pg:local        (en otra terminal)
 *   npm run preparar:local
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../infra/prisma/cliente.js';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Este script sólo corre contra una base local.');
  process.exit(1);
}

const carpeta = path.resolve('prisma/migrations');
/** En orden: los nombres empiezan con la fecha, así que alfabético alcanza. */
const migraciones = fs
  .readdirSync(carpeta, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(carpeta, e.name, 'migration.sql')))
  .map((e) => e.name)
  .sort();

if (migraciones.length === 0) {
  console.error('No hay migraciones en prisma/migrations.');
  process.exit(1);
}

const sentenciasDe = (sql: string) =>
  sql
    // Las líneas de comentario van adentro de cada sentencia: se sacan primero.
    .split(/\r?\n/)
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter((sentencia) => sentencia.length > 0);

let aplicadas = 0;
let salteadas = 0;
for (const migracion of migraciones) {
  const sql = fs.readFileSync(path.join(carpeta, migracion, 'migration.sql'), 'utf8');
  for (const sentencia of sentenciasDe(sql)) {
    try {
      await prisma.$executeRawUnsafe(sentencia);
      aplicadas++;
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      // Correrlo de nuevo sobre una base ya armada no es un error.
      if (!/already exists|ya existe|duplicate|does not exist/i.test(mensaje)) {
        console.error(`\nFalló en ${migracion}:\n${sentencia}\n`);
        throw error;
      }
      salteadas++;
    }
  }
}
console.log(
  `migraciones: ${migraciones.length} · sentencias aplicadas: ${aplicadas}` +
    (salteadas > 0 ? ` · ya estaban: ${salteadas}` : ''),
);

// El seed va en la misma conexión.
const { sembrar } = await import('./sembrar.js');
await sembrar();
await prisma.$disconnect();
