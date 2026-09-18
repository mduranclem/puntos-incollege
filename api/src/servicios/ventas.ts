/**
 * Qué se vendió en cada operación (D-027).
 *
 * Los ítems se guardan con el nombre y el precio **del momento**: si mañana
 * cambia el precio del catálogo, la venta de ayer no se reescribe. Es el mismo
 * criterio que con la tasa de puntos (D-009).
 *
 * Cuelgan del pago cuando se cobró plata, o del movimiento cuando se canjearon
 * puntos, así el registro diario ve las dos cosas.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import { parsearImporte, formatearPesos } from '../dominio/dinero.js';
import { ErrorDeNegocio } from '../dominio/tipos.js';

export type ItemPedido = {
  /** Del catálogo, o vacío si es un artículo suelto cargado a mano. */
  articuloId?: string;
  /** Obligatorio cuando no viene del catálogo. */
  descripcion?: string;
  cantidad: number;
  /** Precio unitario tipeado. Si viene del catálogo y no se manda, se usa el de lista. */
  precioUnitario?: string;
};

export type ItemResuelto = {
  articuloId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: bigint;
  subtotalCentavos: bigint;
};

/**
 * Convierte lo que mandó la pantalla en ítems con precio cerrado. El precio del
 * catálogo se lee acá, en el servidor: la pantalla no puede inventar precios.
 */
export async function resolverItems(
  prisma: PrismaClient,
  pedidos: ItemPedido[],
): Promise<{ items: ItemResuelto[]; totalCentavos: bigint }> {
  if (pedidos.length === 0) return { items: [], totalCentavos: 0n };

  const idsDelCatalogo = pedidos.map((p) => p.articuloId).filter((id): id is string => !!id);
  const delCatalogo = idsDelCatalogo.length
    ? await prisma.articulo.findMany({ where: { id: { in: idsDelCatalogo } } })
    : [];
  const porId = new Map(delCatalogo.map((a) => [a.id, a]));

  const items: ItemResuelto[] = [];
  for (const pedido of pedidos) {
    if (!Number.isInteger(pedido.cantidad) || pedido.cantidad < 1 || pedido.cantidad > 999) {
      throw new ErrorDeNegocio('ITEM_INVALIDO', 'La cantidad tiene que estar entre 1 y 999');
    }

    const articulo = pedido.articuloId ? porId.get(pedido.articuloId) : undefined;
    if (pedido.articuloId && !articulo) {
      throw new ErrorDeNegocio('ARTICULO_INEXISTENTE', 'Ese artículo ya no está en la lista');
    }

    const descripcion = (pedido.descripcion ?? articulo?.nombre ?? '').trim();
    if (!descripcion) {
      throw new ErrorDeNegocio('ITEM_INVALIDO', 'Cada artículo necesita un nombre');
    }

    // El precio de lista manda salvo que el vendedor lo pise a propósito.
    const precioUnitarioCentavos = pedido.precioUnitario
      ? parsearImporte(pedido.precioUnitario)
      : (articulo?.precioCentavos ?? null);
    if (precioUnitarioCentavos === null) {
      throw new ErrorDeNegocio('ITEM_INVALIDO', `Falta el precio de "${descripcion}"`);
    }
    if (precioUnitarioCentavos < 0n) {
      throw new ErrorDeNegocio('ITEM_INVALIDO', 'El precio no puede ser negativo');
    }

    items.push({
      articuloId: articulo?.id ?? null,
      descripcion: descripcion.slice(0, 120),
      cantidad: pedido.cantidad,
      precioUnitarioCentavos,
      subtotalCentavos: precioUnitarioCentavos * BigInt(pedido.cantidad),
    });
  }

  const totalCentavos = items.reduce((suma, i) => suma + i.subtotalCentavos, 0n);
  return { items, totalCentavos };
}

/** Guarda los ítems colgando de un pago o de un movimiento de canje. */
export async function guardarItems(
  tx: Prisma.TransactionClient | PrismaClient,
  items: ItemResuelto[],
  donde: { pagoId?: string; movimientoId?: string },
): Promise<void> {
  if (items.length === 0) return;
  await tx.itemDeVenta.createMany({
    data: items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitarioCentavos: i.precioUnitarioCentavos,
      subtotalCentavos: i.subtotalCentavos,
      articuloId: i.articuloId,
      pagoId: donde.pagoId ?? null,
      movimientoId: donde.movimientoId ?? null,
    })),
  });
}

/** "2 × Chomba bordada, 1 × Remera lisa" para mostrar en una línea. */
export function resumirItems(
  items: Array<{ descripcion: string; cantidad: number }>,
): string | null {
  if (items.length === 0) return null;
  return items.map((i) => (i.cantidad > 1 ? `${i.cantidad} × ${i.descripcion}` : i.descripcion)).join(', ');
}

export { formatearPesos };
