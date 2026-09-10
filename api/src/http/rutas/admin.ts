/**
 * Panel de administración: configuración, movimientos y el pasivo del programa.
 *
 * Cambiar la tasa crea una versión nueva de configuración; no se pisa la anterior
 * y los movimientos ya escritos conservan la tasa con la que se calcularon (D-009).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeRol, exigeSesion } from '../sesion.js';
import { formatearPesos, parsearImporte } from '../../dominio/dinero.js';
import { formatearTelefono, normalizarTelefono } from '../../dominio/telefono.js';
import { configuracionVigente } from '../../servicios/configuracion.js';
import { LINEAS_DE_NEGOCIO, TIPOS_DE_MOVIMIENTO } from '../../dominio/tipos.js';

const NuevaConfiguracion = z.object({
  valorPunto: z.string().min(1),
  topeCanjePorcentaje: z.number().min(0).max(100),
  diasAvisoVencimiento: z.number().int().min(0).max(365),
  tasas: z
    .array(
      z.object({
        lineaDeNegocio: z.enum(LINEAS_DE_NEGOCIO),
        pesosPorPunto: z.string().min(1),
      }),
    )
    .min(1),
  /** Fecha de cierre de la temporada abierta. */
  cierreTemporada: z.string().datetime().optional(),
});

export function rutasDeAdmin() {
  const router = Router();
  router.use(exigeSesion, exigeRol('ADMINISTRADOR'));

  router.get('/configuracion', async (_req, res, next) => {
    try {
      const config = await configuracionVigente(prisma);
      return res.json({
        valorPuntoCentavos: config.valorPuntoCentavos,
        valorPuntoTexto: formatearPesos(config.valorPuntoCentavos),
        topeCanjeBps: config.topeCanjeBps,
        topeCanjePorcentaje: config.topeCanjeBps / 100,
        diasAvisoVencimiento: config.diasAvisoVencimiento,
        temporada: config.temporada,
        tasas: LINEAS_DE_NEGOCIO.map((linea) => ({
          lineaDeNegocio: linea,
          centavosPorPunto: config.tasas[linea] ?? null,
          texto: config.tasas[linea] ? formatearPesos(config.tasas[linea]!) : null,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Guardar = nueva versión vigente desde ahora. La anterior queda para auditoría. */
  router.put('/configuracion', async (req, res, next) => {
    try {
      const datos = NuevaConfiguracion.parse(req.body);
      const actual = await configuracionVigente(prisma);

      const creada = await prisma.configuracion.create({
        data: {
          vigenteDesde: new Date(),
          valorPuntoCentavos: parsearImporte(datos.valorPunto),
          topeCanjeBps: Math.round(datos.topeCanjePorcentaje * 100),
          diasAvisoVencimiento: datos.diasAvisoVencimiento,
          temporadaId: actual.temporada.id,
          creadoPorId: req.sesion!.usuarioId,
          tasas: {
            create: datos.tasas.map((t) => ({
              lineaDeNegocio: t.lineaDeNegocio,
              centavosPorPunto: parsearImporte(t.pesosPorPunto),
            })),
          },
        },
        include: { tasas: true },
      });

      if (datos.cierreTemporada) {
        await prisma.temporada.update({
          where: { id: actual.temporada.id },
          data: { cierreEn: new Date(datos.cierreTemporada) },
        });
      }

      return res.json({ id: creada.id, vigenteDesde: creada.vigenteDesde });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/locales', async (_req, res, next) => {
    try {
      const locales = await prisma.local.findMany({ orderBy: { nombre: 'asc' } });
      return res.json({ locales });
    } catch (error) {
      return next(error);
    }
  });

  /** Listado de movimientos con filtros por local, fecha y cliente. */
  router.get('/movimientos', async (req, res, next) => {
    try {
      const filtros = z
        .object({
          localId: z.string().uuid().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          telefono: z.string().optional(),
          tipo: z.enum(TIPOS_DE_MOVIMIENTO).optional(),
          pagina: z.coerce.number().int().min(1).default(1),
        })
        .parse(req.query);

      const porPagina = 50;
      let clienteId: string | undefined;
      if (filtros.telefono?.trim()) {
        const cliente = await prisma.cliente.findUnique({
          where: {
            telefonoE164: normalizarTelefono(filtros.telefono, {
              areaPorDefecto: req.sesion!.codigoAreaPorDefecto,
            }),
          },
          select: { id: true },
        });
        clienteId = cliente?.id ?? '00000000-0000-0000-0000-000000000000';
      }

      const donde = {
        ...(filtros.localId ? { localId: filtros.localId } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
        ...(clienteId ? { cuenta: { clienteId } } : {}),
        ...(filtros.desde || filtros.hasta
          ? {
              creadoEn: {
                ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
                ...(filtros.hasta ? { lte: new Date(`${filtros.hasta}T23:59:59`) } : {}),
              },
            }
          : {}),
      };

      const [total, movimientos] = await Promise.all([
        prisma.movimiento.count({ where: donde }),
        prisma.movimiento.findMany({
          where: donde,
          orderBy: { secuencia: 'desc' },
          skip: (filtros.pagina - 1) * porPagina,
          take: porPagina,
          include: {
            local: { select: { nombre: true } },
            usuario: { select: { nombre: true } },
            cuenta: { include: { cliente: { select: { nombre: true, telefonoE164: true } } } },
          },
        }),
      ]);

      return res.json({
        total,
        pagina: filtros.pagina,
        paginas: Math.max(1, Math.ceil(total / porPagina)),
        movimientos: movimientos.map((m) => ({
          id: m.id,
          fecha: m.creadoEn,
          tipo: m.tipo,
          puntos: m.puntos,
          montoTexto: m.montoOrigenCentavos ? formatearPesos(m.montoOrigenCentavos) : null,
          cliente: m.cuenta.cliente.nombre,
          telefono: formatearTelefono(m.cuenta.cliente.telefonoE164),
          local: m.local?.nombre ?? null,
          usuario: m.usuario?.nombre ?? null,
          referencia: m.referenciaExterna,
          motivo: m.motivo,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Puntos emitidos, canjeados y vigentes: el pasivo del programa. */
  router.get('/totales', async (_req, res, next) => {
    try {
      const config = await configuracionVigente(prisma);
      const porTipo = await prisma.movimiento.groupBy({
        by: ['tipo'],
        _sum: { puntos: true },
        where: { cuenta: { temporadaId: config.temporada.id } },
      });

      const suma = (tipo: string) =>
        porTipo.find((p) => p.tipo === tipo)?._sum.puntos ?? 0;

      const emitidos = suma('ACREDITACION');
      const canjeados = -suma('CANJE');
      const vencidos = -suma('VENCIMIENTO');
      const revertidos = -suma('REVERSA');
      const ajustes = suma('AJUSTE');
      const vigentes = emitidos - canjeados - vencidos - revertidos + ajustes;
      const pasivoCentavos = BigInt(Math.max(0, vigentes)) * config.valorPuntoCentavos;

      const [clientes, cuentasConSaldo] = await Promise.all([
        prisma.cliente.count({ where: { fusionadoEnId: null } }),
        prisma.cuentaPuntos.count({
          where: { temporadaId: config.temporada.id, saldoCacheado: { gt: 0 } },
        }),
      ]);

      return res.json({
        temporada: config.temporada,
        emitidos,
        canjeados,
        vencidos,
        revertidos,
        ajustes,
        vigentes,
        pasivoCentavos,
        pasivoTexto: formatearPesos(pasivoCentavos),
        clientes,
        cuentasConSaldo,
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Control de la caché: tiene que coincidir con la suma de los movimientos (D-004). */
  router.get('/control-caches', async (_req, res, next) => {
    try {
      const desfasadas = await prisma.$queryRaw<
        Array<{ id: string; saldoCacheado: number; saldoReal: number }>
      >`
        SELECT c.id,
               c."saldoCacheado",
               COALESCE(SUM(m.puntos), 0)::int AS "saldoReal"
        FROM "CuentaPuntos" c
        LEFT JOIN "Movimiento" m ON m."cuentaId" = c.id
        GROUP BY c.id, c."saldoCacheado"
        HAVING c."saldoCacheado" <> COALESCE(SUM(m.puntos), 0)::int
      `;
      return res.json({ ok: desfasadas.length === 0, desfasadas });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
