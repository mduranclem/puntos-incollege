/**
 * Tareas programadas: despacho de avisos.
 *
 * Se puede correr como proceso aparte (`npm run tareas`) o dentro de la API con
 * CRON_HABILITADO=true. Todas las tareas son idempotentes, así que correrlas de
 * más no rompe nada.
 *
 * Acá vivía también el vencimiento de temporada. Los puntos no vencen (D-058):
 * no hay nada que correr.
 */
import { prisma } from './infra/prisma/cliente.js';
import { despacharPendientes } from './servicios/despachador.js';

const MINUTO = 60_000;

export function arrancarTareas() {
  const registro = (texto: string) => console.log(`[tareas] ${texto}`);

  const despachar = async () => {
    try {
      const resultado = await despacharPendientes(prisma);
      if (resultado.enviados || resultado.fallidos) {
        registro(`avisos: ${resultado.enviados} enviados, ${resultado.fallidos} fallidos`);
      }
    } catch (error) {
      console.error('[tareas] error despachando avisos', error);
    }
  };

  void despachar();
  const relojAvisos = setInterval(despachar, MINUTO);

  return () => {
    clearInterval(relojAvisos);
  };
}

// Ejecución directa: `npm run tareas`.
if (process.argv[1]?.includes('tareas')) {
  arrancarTareas();
  console.log('[tareas] corriendo. Ctrl+C para salir.');
}
