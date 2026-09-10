/**
 * Tareas programadas: despacho de avisos y vencimiento de temporada.
 *
 * Se puede correr como proceso aparte (`npm run tareas`) o dentro de la API con
 * CRON_HABILITADO=true. Todas las tareas son idempotentes, así que correrlas de
 * más no rompe nada.
 */
import { prisma } from './infra/prisma/cliente.js';
import { despacharPendientes } from './servicios/despachador.js';
import {
  avisarProximosVencimientos,
  vencerTemporadasCerradas,
} from './servicios/vencimientos.js';

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

  const vencer = async () => {
    try {
      const aviso = await avisarProximosVencimientos(prisma);
      if (aviso.avisados) registro(`avisos de vencimiento encolados: ${aviso.avisados}`);
      const vencimiento = await vencerTemporadasCerradas(prisma);
      if (vencimiento.cuentasVencidas) {
        registro(
          `temporadas vencidas: ${vencimiento.temporadas}, cuentas: ${vencimiento.cuentasVencidas}`,
        );
      }
    } catch (error) {
      console.error('[tareas] error en el vencimiento', error);
    }
  };

  void despachar();
  void vencer();
  const relojAvisos = setInterval(despachar, MINUTO);
  const relojVencimiento = setInterval(vencer, 60 * MINUTO);

  return () => {
    clearInterval(relojAvisos);
    clearInterval(relojVencimiento);
  };
}

// Ejecución directa: `npm run tareas`.
if (process.argv[1]?.includes('tareas')) {
  arrancarTareas();
  console.log('[tareas] corriendo. Ctrl+C para salir.');
}
