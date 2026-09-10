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

const archivo = path.resolve('prisma/migrations/20260101000000_inicial/migration.sql');
const sentencias = fs
  .readFileSync(archivo, 'utf8')
  // Las líneas de comentario van adentro de cada sentencia: se sacan primero.
  .split(/\r?\n/)
  .filter((linea) => !linea.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((sentencia) => sentencia.trim())
  .filter((sentencia) => sentencia.length > 0);

let aplicadas = 0;
for (const sentencia of sentencias) {
  try {
    await prisma.$executeRawUnsafe(sentencia);
    aplicadas++;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    if (!/already exists|ya existe/i.test(mensaje)) throw error;
  }
}
console.log(`migración: ${aplicadas} sentencias aplicadas`);

// El seed va en la misma conexión.
const { sembrar } = await import('./sembrar.js');
await sembrar();
await prisma.$disconnect();
