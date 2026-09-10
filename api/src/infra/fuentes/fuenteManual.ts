/**
 * Fuente de pagos: carga manual en el mostrador (D-003).
 *
 * Es la única fuente implementada en esta entrega. Lee los pagos que quedaron
 * pendientes de procesar y los entrega normalizados. La pantalla de cobro además
 * ingiere el pago en el momento —el vendedor necesita el saldo ya— pero el
 * camino por lotes existe y es el mismo que va a usar la fuente de egresados.
 */
import type { PrismaClient } from '@prisma/client';
import type { Cursor, FuenteDePagos, PagoNormalizado } from '../../motor/puertos.js';
import type { LineaDeNegocio, MedioDePago } from '../../dominio/tipos.js';

export class FuenteManual implements FuenteDePagos {
  readonly nombre = 'manual';

  constructor(private readonly prisma: PrismaClient) {}

  async traerPagosNuevos(
    cursor: Cursor,
    limite: number,
  ): Promise<{ pagos: PagoNormalizado[]; cursor: Cursor }> {
    const filas = await this.prisma.pago.findMany({
      where: {
        origen: 'MANUAL',
        estado: 'PENDIENTE',
        ...(cursor.desde ? { ocurridoEn: { gte: cursor.desde } } : {}),
      },
      orderBy: [{ ocurridoEn: 'asc' }, { referenciaExterna: 'asc' }],
      take: limite,
      include: { cliente: true, local: true },
    });

    const pagos: PagoNormalizado[] = filas.map((fila) => ({
      referenciaExterna: fila.referenciaExterna,
      ocurridoEn: fila.ocurridoEn,
      importeCentavos: fila.importeCentavos,
      medioDePago: fila.medioDePago as MedioDePago,
      lineaDeNegocio: fila.lineaDeNegocio as LineaDeNegocio,
      localCodigo: fila.local.codigo,
      cliente: {
        telefonoCrudo: fila.cliente.telefonoE164,
        nombre: fila.cliente.nombre,
        documento: fila.cliente.documento ?? undefined,
      },
      usuarioId: fila.usuarioId ?? undefined,
      metadata: (fila.metadata as Record<string, unknown> | null) ?? undefined,
    }));

    const ultimo = filas[filas.length - 1];
    return {
      pagos,
      cursor: ultimo
        ? { desde: ultimo.ocurridoEn, ultimaReferencia: ultimo.referenciaExterna }
        : cursor,
    };
  }
}

/**
 * Guía para la fuente que falta (no se construye en esta entrega).
 *
 * El sistema de gestión de egresados expone por cada cobro: correlativo único de
 * 8 dígitos, concepto del medio de pago (el efectivo figura como "EFECTIVO"),
 * fecha, importe y número de cliente con nombre y teléfono. El mapeo a
 * `PagoNormalizado` está en DECISIONES.md § D-003. Implementar acá una clase
 * `FuenteEgresados implements FuenteDePagos` —lea la base, una API o la
 * exportación a Excel de Listados— alcanza para que los pagos de egresados
 * acrediten puntos: el motor, el libro mayor y las pantallas no se tocan.
 */
