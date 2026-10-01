/**
 * Catálogo de artículos (D-027).
 *
 * El listado lo lee cualquier usuario con sesión: son los botones del mostrador.
 * Crearlos y editarlos es sólo de la gerencia (D-026).
 *
 * No se borran: se desactivan. Un artículo borrado dejaría ventas apuntando a
 * la nada, y el registro diario tiene que poder reconstruir qué se vendió (D-004).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeRol, exigeSesion } from '../sesion.js';
import { formatearPesos, parsearImporte, parsearPrecioDeLista } from '../../dominio/dinero.js';
import { LINEAS_DE_NEGOCIO, TALLES, TALLE_BASE } from '../../dominio/tipos.js';

const Articulo = z.object({
  nombre: z.string().trim().min(2).max(120),
  categoria: z.string().trim().max(60).optional(),
  detalle: z.string().trim().max(200).optional(),
  precio: z.string().min(1).max(20),
  lineaDeNegocio: z.enum(LINEAS_DE_NEGOCIO).optional(),
  orden: z.number().int().min(0).max(999).optional(),
  activo: z.boolean().optional(),
  visibleEnApp: z.boolean().optional(),
});

const Cambio = Articulo.partial();

type PrecioDeTalle = {
  talle: string;
  precioCentavos: bigint;
  actualizadoEn: Date;
  actualizadoPor?: { nombre: string } | null;
};

const aSalida = (a: {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  detalle: string | null;
  precioCentavos: bigint;
  lineaDeNegocio: string | null;
  orden: number;
  activo: boolean;
  visibleEnApp: boolean;
  precios?: PrecioDeTalle[];
}) => ({
  id: a.id,
  codigo: a.codigo,
  nombre: a.nombre,
  categoria: a.categoria,
  detalle: a.detalle,
  precioCentavos: a.precioCentavos,
  precioTexto: formatearPesos(a.precioCentavos),
  lineaDeNegocio: a.lineaDeNegocio,
  orden: a.orden,
  activo: a.activo,
  visibleEnApp: a.visibleEnApp,
  // En el orden del dominio —de más chico a más grande— y no en el que los
  // devuelva la base.
  precios: TALLES.map((talle) => {
    const p = a.precios?.find((x) => x.talle === talle);
    if (!p) return null;
    return {
      talle,
      precioCentavos: p.precioCentavos,
      precioTexto: formatearPesos(p.precioCentavos),
      actualizadoEn: p.actualizadoEn,
      actualizadoPor: p.actualizadoPor?.nombre ?? null,
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null),
});

const CON_PRECIOS = {
  precios: { include: { actualizadoPor: { select: { nombre: true } } } },
} as const;

/** Lo que manda la grilla del panel: un precio por talle. */
const CambioDePrecios = z.object({
  precios: z
    .array(
      z.object({
        talle: z.enum(TALLES),
        precio: z.union([z.string(), z.number()]),
      }),
    )
    .min(1)
    .max(TALLES.length),
});

export function rutasDeArticulos() {
  const router = Router();
  router.use(exigeSesion);

  /** Los botones del mostrador. Por defecto sólo los activos. */
  router.get('/', async (req, res, next) => {
    try {
      const todos = req.query.todos === 'si';
      const articulos = await prisma.articulo.findMany({
        where: todos ? {} : { activo: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        include: CON_PRECIOS,
      });
      return res.json({ articulos: articulos.map(aSalida) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', exigeRol('GERENTE'), async (req, res, next) => {
    try {
      const datos = Articulo.parse(req.body);
      const creado = await prisma.articulo.create({
        data: {
          nombre: datos.nombre,
          categoria: datos.categoria || null,
          detalle: datos.detalle || null,
          precioCentavos: parsearImporte(datos.precio),
          lineaDeNegocio: datos.lineaDeNegocio ?? null,
          orden: datos.orden ?? 0,
          activo: datos.activo ?? true,
          visibleEnApp: datos.visibleEnApp ?? true,
        },
        include: CON_PRECIOS,
      });
      return res.status(201).json(aSalida(creado));
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/:id', exigeRol('GERENTE'), async (req, res, next) => {
    try {
      const datos = Cambio.parse(req.body);
      const actualizado = await prisma.articulo.update({
        where: { id: String(req.params.id) },
        data: {
          ...(datos.nombre ? { nombre: datos.nombre } : {}),
          ...(datos.categoria !== undefined ? { categoria: datos.categoria || null } : {}),
          ...(datos.detalle !== undefined ? { detalle: datos.detalle || null } : {}),
          ...(datos.precio ? { precioCentavos: parsearImporte(datos.precio) } : {}),
          ...(datos.lineaDeNegocio ? { lineaDeNegocio: datos.lineaDeNegocio } : {}),
          ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
          ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
          ...(datos.visibleEnApp !== undefined ? { visibleEnApp: datos.visibleEnApp } : {}),
        },
        include: CON_PRECIOS,
      });
      return res.json(aSalida(actualizado));
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Cambiar los precios por talle. Sólo gerencia (D-049).
   *
   * La restricción vive acá y no en el botón del panel: `exigeRol` devuelve 403
   * aunque el pedido llegue con curl. Esconder el botón es cortesía; esto es la
   * cerradura.
   *
   * Se escriben los cuatro de una, en una transacción: que una lista quede con
   * dos talles nuevos y dos viejos es peor que no haber cambiado nada.
   *
   * El talle base también actualiza `Articulo.precioCentavos`, que es el precio
   * "de entrada" y lo que usa todo lo que todavía no pregunta el talle.
   */
  router.put('/:id/precios', exigeRol('GERENTE'), async (req, res, next) => {
    try {
      const { precios } = CambioDePrecios.parse(req.body);
      const articuloId = String(req.params.id);
      const usuarioId = req.sesion?.usuarioId ?? null;

      // Se valida todo antes de escribir nada.
      const aEscribir = precios.map((p) => ({
        talle: p.talle,
        precioCentavos: parsearPrecioDeLista(p.precio),
      }));

      const articulo = await prisma.articulo.findUnique({ where: { id: articuloId } });
      if (!articulo) {
        return res.status(404).json({ error: 'ARTICULO_INEXISTENTE' });
      }

      const base = aEscribir.find((p) => p.talle === TALLE_BASE);

      const actualizado = await prisma.$transaction(async (tx) => {
        for (const p of aEscribir) {
          await tx.precioPorTalle.upsert({
            where: { articuloId_talle: { articuloId, talle: p.talle } },
            create: { articuloId, talle: p.talle, precioCentavos: p.precioCentavos, actualizadoPorId: usuarioId },
            update: { precioCentavos: p.precioCentavos, actualizadoPorId: usuarioId },
          });
        }
        if (base) {
          await tx.articulo.update({
            where: { id: articuloId },
            data: { precioCentavos: base.precioCentavos },
          });
        }
        return tx.articulo.findUniqueOrThrow({ where: { id: articuloId }, include: CON_PRECIOS });
      });

      return res.json(aSalida(actualizado));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
