/**
 * Registro diario de ventas para la gerencia (D-027).
 *
 * Es la respuesta a "¿qué pasó hoy?": totales del día, comparación entre locales,
 * qué se vendió más y el detalle operación por operación. Sólo lo ve la gerencia
 * (D-026).
 *
 * El día es un día de calendario argentino, igual que el cierre de temporada
 * (D-020): "las ventas del martes" terminan a la medianoche de Rosario, no a las
 * 21 hs por estar leyendo en UTC.
 */
import type { PrismaClient } from '@prisma/client';
import { formatearPesos } from '../dominio/dinero.js';
import { esFechaSimple, fechaArgentina, OFFSET_ARGENTINA } from '../dominio/fechas.js';
import { resumirItems } from './ventas.js';
import { ErrorDeNegocio, type MedioDePago } from '../dominio/tipos.js';

function rangoDelDia(fecha: string): { desde: Date; hasta: Date } {
  if (!esFechaSimple(fecha)) {
    throw new ErrorDeNegocio('FECHA_INVALIDA', 'La fecha debe tener el formato AAAA-MM-DD');
  }
  return {
    desde: new Date(`${fecha}T00:00:00.000${OFFSET_ARGENTINA}`),
    hasta: new Date(`${fecha}T23:59:59.999${OFFSET_ARGENTINA}`),
  };
}

export async function registroDelDia(
  prisma: PrismaClient,
  fecha: string = fechaArgentina(new Date()),
  localId?: string,
) {
  const { desde, hasta } = rangoDelDia(fecha);
  const enElDia = { gte: desde, lte: hasta };

  const [pagos, canjes, locales] = await Promise.all([
    prisma.pago.findMany({
      where: {
        ocurridoEn: enElDia,
        estado: { not: 'ANULADO' },
        ...(localId ? { localId } : {}),
      },
      orderBy: { ocurridoEn: 'desc' },
      include: {
        items: true,
        cliente: { select: { nombre: true } },
        local: { select: { id: true, nombre: true } },
        usuario: { select: { nombre: true } },
      },
    }),
    prisma.movimiento.findMany({
      where: { tipo: 'CANJE', creadoEn: enElDia, ...(localId ? { localId } : {}) },
      orderBy: { creadoEn: 'desc' },
      include: {
        items: true,
        local: { select: { id: true, nombre: true } },
        usuario: { select: { nombre: true } },
        cuenta: { include: { cliente: { select: { nombre: true } } } },
      },
    }),
    prisma.local.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
  ]);

  // --- Totales del día ---
  const porMedio = new Map<MedioDePago, { cantidad: number; centavos: bigint }>();
  let cobradoCentavos = 0n;
  for (const pago of pagos) {
    cobradoCentavos += pago.importeCentavos;
    const medio = pago.medioDePago as MedioDePago;
    const actual = porMedio.get(medio) ?? { cantidad: 0, centavos: 0n };
    porMedio.set(medio, {
      cantidad: actual.cantidad + 1,
      centavos: actual.centavos + pago.importeCentavos,
    });
  }

  const descontadoCentavos = canjes.reduce((suma, c) => {
    const valor = c.valorPuntoAplicadoCentavos ?? 0n;
    return suma + BigInt(-c.puntos) * valor;
  }, 0n);
  const puntosCanjeados = canjes.reduce((suma, c) => suma + -c.puntos, 0);

  // --- Por local ---
  const porLocal = new Map<string, { nombre: string; operaciones: number; centavos: bigint; canjeCentavos: bigint }>();
  for (const local of locales) {
    porLocal.set(local.id, { nombre: local.nombre, operaciones: 0, centavos: 0n, canjeCentavos: 0n });
  }
  for (const pago of pagos) {
    const fila = porLocal.get(pago.local.id);
    if (!fila) continue;
    fila.operaciones++;
    fila.centavos += pago.importeCentavos;
  }
  for (const canje of canjes) {
    const fila = canje.local ? porLocal.get(canje.local.id) : undefined;
    if (!fila) continue;
    fila.canjeCentavos += BigInt(-canje.puntos) * (canje.valorPuntoAplicadoCentavos ?? 0n);
  }

  // --- Ranking de artículos: suma pagos y canjes ---
  const porArticulo = new Map<string, { unidades: number; centavos: bigint }>();
  for (const item of [...pagos, ...canjes].flatMap((o) => o.items)) {
    const actual = porArticulo.get(item.descripcion) ?? { unidades: 0, centavos: 0n };
    porArticulo.set(item.descripcion, {
      unidades: actual.unidades + item.cantidad,
      centavos: actual.centavos + item.subtotalCentavos,
    });
  }

  // --- Detalle, las dos cosas en una sola línea de tiempo ---
  const detalle = [
    ...pagos.map((p) => ({
      fecha: p.ocurridoEn,
      tipo: 'COBRO' as const,
      quePasó: resumirItems(p.items) ?? 'Sin detalle cargado',
      montoCentavos: p.importeCentavos,
      montoTexto: formatearPesos(p.importeCentavos),
      medioDePago: p.medioDePago,
      cliente: p.cliente.nombre,
      local: p.local.nombre,
      usuario: p.usuario?.nombre ?? null,
    })),
    ...canjes.map((c) => {
      const descuento = BigInt(-c.puntos) * (c.valorPuntoAplicadoCentavos ?? 0n);
      return {
        fecha: c.creadoEn,
        tipo: 'CANJE' as const,
        quePasó: resumirItems(c.items) ?? 'Sin detalle cargado',
        montoCentavos: descuento,
        montoTexto: formatearPesos(descuento),
        medioDePago: null,
        cliente: c.cuenta.cliente.nombre,
        local: c.local?.nombre ?? '—',
        usuario: c.usuario?.nombre ?? null,
        puntos: -c.puntos,
      };
    }),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  return {
    fecha,
    totales: {
      operaciones: pagos.length,
      cobradoCentavos,
      cobradoTexto: formatearPesos(cobradoCentavos),
      descontadoEnCanjesTexto: formatearPesos(descontadoCentavos),
      puntosCanjeados,
      canjes: canjes.length,
      porMedioDePago: [...porMedio.entries()]
        .map(([medio, d]) => ({
          medioDePago: medio,
          cantidad: d.cantidad,
          texto: formatearPesos(d.centavos),
          centavos: d.centavos,
        }))
        .sort((a, b) => (b.centavos > a.centavos ? 1 : -1)),
    },
    porLocal: [...porLocal.values()]
      .map((l) => ({
        nombre: l.nombre,
        operaciones: l.operaciones,
        cobradoTexto: formatearPesos(l.centavos),
        canjeadoTexto: formatearPesos(l.canjeCentavos),
        centavos: l.centavos,
      }))
      .sort((a, b) => (b.centavos > a.centavos ? 1 : -1)),
    ranking: [...porArticulo.entries()]
      .map(([descripcion, d]) => ({
        descripcion,
        unidades: d.unidades,
        totalTexto: formatearPesos(d.centavos),
        centavos: d.centavos,
      }))
      .sort((a, b) => b.unidades - a.unidades || (b.centavos > a.centavos ? 1 : -1))
      .slice(0, 20),
    detalle,
  };
}
