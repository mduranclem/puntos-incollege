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
import { despacharPendientes } from '../../servicios/despachador.js';
import { registroDelDia } from '../../servicios/registroDiario.js';
import { esFechaSimple, fechaArgentina, finDelDiaArgentina } from '../../dominio/fechas.js';

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
  /** Fecha de cierre de la temporada abierta, como fecha de calendario AAAA-MM-DD (D-020). */
  cierreTemporada: z
    .string()
    .refine(esFechaSimple, 'La fecha de cierre debe tener el formato AAAA-MM-DD')
    .optional(),
});

export function rutasDeAdmin() {
  const router = Router();
  router.use(exigeSesion, exigeRol('GERENTE'));

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
        /// La fecha tal como se muestra y se edita: calendario argentino (D-020).
        cierreFecha: fechaArgentina(config.temporada.cierreEn),
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
          data: { cierreEn: finDelDiaArgentina(datos.cierreTemporada) },
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

  /**
   * Registro diario: qué se vendió hoy, por local, qué se vendió más y el
   * detalle operación por operación (D-027). Sólo la gerencia (D-026).
   */
  router.get('/registro-diario', async (req, res, next) => {
    try {
      const fecha = req.query.fecha ? String(req.query.fecha) : undefined;
      const localId = req.query.localId ? String(req.query.localId) : undefined;
      return res.json(await registroDelDia(prisma, fecha, localId));
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

  /** Cola de avisos hacia n8n: qué se mandó, qué está pendiente y qué falló (D-014). */
  router.get('/avisos', async (_req, res, next) => {
    try {
      const [porEstado, ultimos] = await Promise.all([
        prisma.eventoSaliente.groupBy({ by: ['estado'], _count: { _all: true } }),
        prisma.eventoSaliente.findMany({ orderBy: { creadoEn: 'desc' }, take: 25 }),
      ]);
      return res.json({
        configurado: Boolean(process.env.N8N_WEBHOOK_URL?.trim()),
        porEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count._all])),
        ultimos: ultimos.map((e) => ({
          id: e.id,
          tipo: e.tipo,
          estado: e.estado,
          intentos: e.intentos,
          creadoEn: e.creadoEn,
          enviadoEn: e.enviadoEn,
          ultimoError: e.ultimoError,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Empujón manual de la cola, por si hace falta destrabar algo. */
  router.post('/avisos/despachar', async (_req, res, next) => {
    try {
      return res.json(await despacharPendientes(prisma));
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
