/**
 * Formas de pago del mostrador y su recargo (D-061).
 *
 * El precio de lista es de contado. Pagar con tarjeta o QR le cuesta plata a la
 * casa —el arancel de la tarjeta, el costo de la cuota— y ese costo se traslada
 * como recargo sobre el precio de lista.
 *
 * Los valores viven en la tabla `FormaDePago` y los edita la gerencia (D-009).
 * Acá sólo está el punto de partida de una instalación nueva.
 */
import type { PrismaClient } from '@prisma/client';
import { aplicarRecargo, formatearPesos } from '../dominio/dinero.js';
import { ErrorDeNegocio, type MedioDePago } from '../dominio/tipos.js';

export type FormaDePagoVigente = {
  codigo: string;
  nombre: string;
  medioDePago: MedioDePago;
  recargoBps: number;
  cuotas: number;
  orden: number;
  activa: boolean;
};

/**
 * Los recargos que pasó la gerencia: 14% con QR, débito o crédito en un pago,
 * 23% en tres cuotas, 35% en seis. El efectivo y la transferencia no tienen
 * recargo —no le cuestan nada a la casa— y el efectivo es además el único que
 * suma puntos (D-001).
 *
 * "Crédito 3 cuotas" y "Crédito 6 cuotas" comparten `medioDePago`: en el libro
 * mayor las dos son TARJETA_CREDITO. Lo que las distingue es el recargo.
 */
export const FORMAS_INICIALES: Array<Omit<FormaDePagoVigente, 'activa'>> = [
  { codigo: 'efectivo', nombre: 'Efectivo', medioDePago: 'EFECTIVO', recargoBps: 0, cuotas: 1, orden: 1 },
  {
    codigo: 'transferencia',
    nombre: 'Transferencia',
    medioDePago: 'TRANSFERENCIA',
    recargoBps: 0,
    cuotas: 1,
    orden: 2,
  },
  { codigo: 'debito', nombre: 'Débito', medioDePago: 'TARJETA_DEBITO', recargoBps: 1400, cuotas: 1, orden: 3 },
  { codigo: 'qr', nombre: 'QR', medioDePago: 'QR', recargoBps: 1400, cuotas: 1, orden: 4 },
  {
    codigo: 'billetera',
    nombre: 'Billetera',
    medioDePago: 'BILLETERA_VIRTUAL',
    recargoBps: 1400,
    cuotas: 1,
    orden: 5,
  },
  {
    codigo: 'credito-1',
    nombre: 'Crédito 1 pago',
    medioDePago: 'TARJETA_CREDITO',
    recargoBps: 1400,
    cuotas: 1,
    orden: 6,
  },
  {
    codigo: 'credito-3',
    nombre: 'Crédito 3 cuotas',
    medioDePago: 'TARJETA_CREDITO',
    recargoBps: 2300,
    cuotas: 3,
    orden: 7,
  },
  {
    codigo: 'credito-6',
    nombre: 'Crédito 6 cuotas',
    medioDePago: 'TARJETA_CREDITO',
    recargoBps: 3500,
    cuotas: 6,
    orden: 8,
  },
];

/**
 * Carga las formas iniciales si la tabla está vacía, y nada más.
 *
 * Es para que el día del despliegue el mostrador no quede sin formas de pago:
 * la migración crea la tabla vacía y el seed completo no se puede correr en
 * producción (pide las contraseñas de alta). Si ya hay una fila, no toca nada:
 * los recargos que editó la gerencia mandan sobre estos.
 */
export async function asegurarFormasDePago(prisma: PrismaClient): Promise<void> {
  if ((await prisma.formaDePago.count()) > 0) return;
  await prisma.formaDePago.createMany({ data: FORMAS_INICIALES, skipDuplicates: true });
}

export async function formasDePago(
  prisma: PrismaClient,
  opciones: { soloActivas?: boolean } = {},
): Promise<FormaDePagoVigente[]> {
  await asegurarFormasDePago(prisma);
  const filas = await prisma.formaDePago.findMany({
    where: opciones.soloActivas ? { activa: true } : {},
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  });
  return filas.map((f) => ({
    codigo: f.codigo,
    nombre: f.nombre,
    medioDePago: f.medioDePago as MedioDePago,
    recargoBps: f.recargoBps,
    cuotas: f.cuotas,
    orden: f.orden,
    activa: f.activa,
  }));
}

/** La forma que eligió el mostrador. Si no existe o está apagada, el cobro se corta. */
export async function formaDePagoVigente(
  prisma: PrismaClient,
  codigo: string,
): Promise<FormaDePagoVigente> {
  await asegurarFormasDePago(prisma);
  const fila = await prisma.formaDePago.findUnique({ where: { codigo } });
  if (!fila || !fila.activa) {
    throw new ErrorDeNegocio('FORMA_DE_PAGO_INVALIDA', `No hay una forma de pago "${codigo}" habilitada`, {
      codigo,
    });
  }
  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    medioDePago: fila.medioDePago as MedioDePago,
    recargoBps: fila.recargoBps,
    cuotas: fila.cuotas,
    orden: fila.orden,
    activa: fila.activa,
  };
}

export type ImporteConRecargo = {
  /** Precio de lista: lo que suman los artículos vendidos. */
  baseCentavos: bigint;
  recargoBps: number;
  recargoCentavos: bigint;
  /** Lo que se le cobra a la persona. */
  totalCentavos: bigint;
};

/**
 * Cuánto se cobra con esta forma de pago.
 *
 * El recargo no cambia los puntos: el único medio que acredita es el efectivo
 * (D-001), y el efectivo no tiene recargo. Si algún día se le pusiera recargo a
 * una forma que acredita, los puntos se calcularían sobre el total cobrado, que
 * es lo que entra en la caja.
 */
export function conRecargo(
  forma: Pick<FormaDePagoVigente, 'recargoBps'>,
  baseCentavos: bigint,
): ImporteConRecargo {
  const recargoCentavos = aplicarRecargo(baseCentavos, forma.recargoBps);
  return {
    baseCentavos,
    recargoBps: forma.recargoBps,
    recargoCentavos,
    totalCentavos: baseCentavos + recargoCentavos,
  };
}

/** "14%" para la pantalla y el panel. Sin decimales cuando no hacen falta. */
export function textoDeRecargo(recargoBps: number): string {
  if (recargoBps === 0) return 'sin recargo';
  const porcentaje = recargoBps / 100;
  return `${Number.isInteger(porcentaje) ? porcentaje : porcentaje.toFixed(2).replace('.', ',')}%`;
}

export { formatearPesos };
