/**
 * Lectura de la configuración vigente (D-009). Nada de tasas ni topes en el código:
 * todo sale de la base y se puede cambiar desde el panel sin redeployar.
 */
import type { PrismaClient } from '@prisma/client';
import { ErrorDeNegocio, type LineaDeNegocio } from '../dominio/tipos.js';

export type TemporadaVigente = {
  id: string;
  nombre: string;
  inicioEn: Date;
  cierreEn: Date;
};

export type ConfiguracionVigente = {
  id: string;
  valorPuntoCentavos: bigint;
  topeCanjeBps: number;
  diasAvisoVencimiento: number;
  /** Centavos que hay que pagar en efectivo para sumar un punto, por línea. */
  tasas: Record<LineaDeNegocio, bigint | undefined>;
  temporada: TemporadaVigente;
};

export async function temporadaVigente(prisma: PrismaClient): Promise<TemporadaVigente> {
  const temporada = await prisma.temporada.findFirst({
    where: { cerrada: false },
    orderBy: { inicioEn: 'desc' },
  });
  if (!temporada) {
    throw new ErrorDeNegocio('SIN_TEMPORADA', 'No hay una temporada abierta');
  }
  return temporada;
}

export async function configuracionVigente(
  prisma: PrismaClient,
  enFecha: Date = new Date(),
): Promise<ConfiguracionVigente> {
  const config = await prisma.configuracion.findFirst({
    where: { vigenteDesde: { lte: enFecha } },
    orderBy: { vigenteDesde: 'desc' },
    include: { tasas: true },
  });
  if (!config) {
    throw new ErrorDeNegocio(
      'SIN_CONFIGURACION',
      'No hay configuración cargada. Corré el seed o cargala desde el panel.',
    );
  }

  const tasas = {} as Record<LineaDeNegocio, bigint | undefined>;
  for (const tasa of config.tasas) {
    tasas[tasa.lineaDeNegocio as LineaDeNegocio] = tasa.centavosPorPunto;
  }

  return {
    id: config.id,
    valorPuntoCentavos: config.valorPuntoCentavos,
    topeCanjeBps: config.topeCanjeBps,
    diasAvisoVencimiento: config.diasAvisoVencimiento,
    tasas,
    temporada: await temporadaVigente(prisma),
  };
}

export function tasaDeLinea(config: ConfiguracionVigente, linea: LineaDeNegocio): bigint {
  const tasa = config.tasas[linea];
  if (!tasa || tasa <= 0n) {
    throw new ErrorDeNegocio(
      'SIN_TASA',
      `No hay tasa de acumulación configurada para la línea ${linea}`,
      { linea },
    );
  }
  return tasa;
}
