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
import { formatearPesos, parsearImporte } from '../../dominio/dinero.js';
import { LINEAS_DE_NEGOCIO } from '../../dominio/tipos.js';

const Articulo = z.object({
  nombre: z.string().trim().min(2).max(120),
  detalle: z.string().trim().max(200).optional(),
  precio: z.string().min(1).max(20),
  lineaDeNegocio: z.enum(LINEAS_DE_NEGOCIO).optional(),
  orden: z.number().int().min(0).max(999).optional(),
  activo: z.boolean().optional(),
  visibleEnApp: z.boolean().optional(),
});

const Cambio = Articulo.partial();

const aSalida = (a: {
  id: string;
  nombre: string;
  detalle: string | null;
  precioCentavos: bigint;
  lineaDeNegocio: string | null;
  orden: number;
  activo: boolean;
  visibleEnApp: boolean;
}) => ({
  id: a.id,
  nombre: a.nombre,
  detalle: a.detalle,
  precioCentavos: a.precioCentavos,
  precioTexto: formatearPesos(a.precioCentavos),
  lineaDeNegocio: a.lineaDeNegocio,
  orden: a.orden,
  activo: a.activo,
  visibleEnApp: a.visibleEnApp,
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
          detalle: datos.detalle || null,
          precioCentavos: parsearImporte(datos.precio),
          lineaDeNegocio: datos.lineaDeNegocio ?? null,
          orden: datos.orden ?? 0,
          activo: datos.activo ?? true,
          visibleEnApp: datos.visibleEnApp ?? true,
        },
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
          ...(datos.detalle !== undefined ? { detalle: datos.detalle || null } : {}),
          ...(datos.precio ? { precioCentavos: parsearImporte(datos.precio) } : {}),
          ...(datos.lineaDeNegocio ? { lineaDeNegocio: datos.lineaDeNegocio } : {}),
          ...(datos.orden !== undefined ? { orden: datos.orden } : {}),
          ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
          ...(datos.visibleEnApp !== undefined ? { visibleEnApp: datos.visibleEnApp } : {}),
        },
      });
      return res.json(aSalida(actualizado));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
