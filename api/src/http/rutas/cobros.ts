/**
 * Cobro en el mostrador. Es la pantalla que se usa con gente esperando, así que
 * es un solo viaje: busca al cliente, registra el pago y —si fue en efectivo—
 * acredita los puntos y devuelve el saldo actualizado.
 *
 * El importe lo cierra el servidor: los artículos dan el precio de lista (D-049)
 * y la forma de pago le suma su recargo (D-061). La pantalla manda qué se vendió
 * y cómo se paga, nunca cuánto hay que cobrar.
 *
 * El pago entra por el ingestor, igual que va a entrar el de egresados (D-003).
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeRol, exigeSesion } from '../sesion.js';
import { MotorDePuntos } from '../../motor/motorPuntos.js';
import { IngestorDePagos } from '../../motor/ingestor.js';
import { RepositorioPrisma } from '../../infra/prisma/repositorioPrisma.js';
import { parsearImporte, formatearPesos } from '../../dominio/dinero.js';
import { resumenDeCuenta } from '../../servicios/saldos.js';
import { linkDeSaldo } from '../../servicios/tokenCliente.js';
import { encolarAvisoDeAcreditacion } from '../../servicios/avisos.js';
import { MEDIOS_DE_PAGO, LINEAS_HABILITADAS, ErrorDeNegocio, TALLES } from '../../dominio/tipos.js';
import { guardarItems, resolverItems, resumirItems } from '../../servicios/ventas.js';
import {
  conRecargo,
  formaDePagoVigente,
  formasDePago,
  textoDeRecargo,
} from '../../servicios/formasDePago.js';

const motor = new MotorDePuntos(new RepositorioPrisma(prisma));
const ingestor = new IngestorDePagos(prisma, motor);

const Item = z.object({
  articuloId: z.string().uuid().optional(),
  descripcion: z.string().trim().max(120).optional(),
  /** Qué talle se vendió. El precio sale de la lista de ese talle (D-049). */
  talle: z.enum(TALLES).optional(),
  cantidad: z.number().int().min(1).max(999).default(1),
  precioUnitario: z.string().max(20).optional(),
});

const Cobro = z.object({
  telefono: z.string().min(3),
  nombre: z.string().trim().max(120).optional(),
  /** Si vienen ítems, el total sale de ellos; si no, del importe tipeado (D-027). */
  items: z.array(Item).max(40).default([]),
  /** Precio de lista, de contado. El recargo lo pone el servidor (D-061). */
  importe: z.string().min(1).optional(),
  /** Código de `FormaDePago`: de ahí salen el medio y el recargo (D-061). */
  formaDePago: z.string().trim().min(1).max(40).optional(),
  /**
   * Camino viejo, de antes del recargo. Se sigue aceptando para que una pantalla
   * desplegada con la versión anterior no deje de cobrar en medio de un sábado:
   * cobra sin recargo, que es exactamente lo que hacía.
   */
  medioDePago: z.enum(MEDIOS_DE_PAGO).optional(),
  lineaDeNegocio: z.enum(['UNIFORMES', 'ROPA_LISA']),
  /** Clave de idempotencia que genera la pantalla: el doble click no duplica (D-006). */
  referencia: z.string().uuid().optional(),
});

export function rutasDeCobros() {
  const router = Router();
  router.use(exigeSesion);

  router.post('/', async (req, res, next) => {
    try {
      const datos = Cobro.parse(req.body);
      const sesion = req.sesion!;

      const { items, totalCentavos } = await resolverItems(prisma, datos.items);
      // Con ítems cargados, la base la manda el detalle: no puede haber un
      // importe que no coincida con lo que dice que se vendió.
      const baseCentavos = items.length > 0 ? totalCentavos : parsearImporte(datos.importe ?? '');
      if (baseCentavos <= 0n) {
        throw new ErrorDeNegocio('IMPORTE_INVALIDO', 'El importe tiene que ser mayor a cero');
      }
      if (!LINEAS_HABILITADAS.includes(datos.lineaDeNegocio)) {
        throw new ErrorDeNegocio('LINEA_NO_HABILITADA', 'Esa línea no participa del programa');
      }

      /**
       * La forma de pago decide dos cosas: con qué medio queda registrado y
       * cuánto se recarga sobre el precio de lista (D-061). El recargo lo
       * calcula el servidor por el mismo motivo que el precio: la pantalla no
       * decide plata (D-049).
       */
      const forma = datos.formaDePago
        ? await formaDePagoVigente(prisma, datos.formaDePago)
        : null;
      const medioDePago = forma?.medioDePago ?? datos.medioDePago;
      if (!medioDePago) {
        throw new ErrorDeNegocio('FORMA_DE_PAGO_INVALIDA', 'Falta la forma de pago');
      }
      const importe = conRecargo({ recargoBps: forma?.recargoBps ?? 0 }, baseCentavos);

      const resultado = await ingestor.ingerir({
        referenciaExterna: `manual:${datos.referencia ?? randomUUID()}`,
        ocurridoEn: new Date(),
        importeCentavos: importe.totalCentavos,
        medioDePago,
        lineaDeNegocio: datos.lineaDeNegocio,
        ...(forma
          ? {
              recargo: {
                formaDePagoCodigo: forma.codigo,
                bps: forma.recargoBps,
                centavos: importe.recargoCentavos,
              },
            }
          : {}),
        localCodigo: sesion.localCodigo,
        cliente: { telefonoCrudo: datos.telefono, nombre: datos.nombre },
        usuarioId: sesion.usuarioId,
        metadata: {
          cargadoPor: sesion.usuario,
          local: sesion.localNombre,
          ...(forma ? { formaDePago: forma.nombre } : {}),
          ...(items.length ? { vendido: resumirItems(items) } : {}),
        },
      });

      if (items.length > 0 && !resultado.yaAplicado) {
        await guardarItems(prisma, items, { pagoId: resultado.pagoId });
      }

      const resumen = await resumenDeCuenta(prisma, resultado.clienteId, 5);
      // La fecha del recibo sale del pago, no del reloj del navegador: es la
      // que quedó en el libro mayor y la que va a coincidir con el registro
      // diario si alguien después compara papel contra sistema (D-043).
      const pago = await prisma.pago.findUniqueOrThrow({
        where: { id: resultado.pagoId },
        select: { creadoEn: true },
      });

      if (resultado.acredito && !resultado.yaAplicado && resultado.puntosAcreditados > 0) {
        await encolarAvisoDeAcreditacion(prisma, {
          clienteId: resultado.clienteId,
          pagoId: resultado.pagoId,
          puntos: resultado.puntosAcreditados,
          saldoPuntos: resumen.saldoPuntos,
        });
      }

      return res.status(201).json({
        pagoId: resultado.pagoId,
        fecha: pago.creadoEn,
        acredito: resultado.acredito,
        yaAplicado: resultado.yaAplicado,
        puntosAcreditados: resultado.puntosAcreditados,
        importeTexto: formatearPesos(importe.totalCentavos),
        // El desglose va completo: en el mostrador hay que poder decir "la
        // prenda sale esto, el recargo de la tarjeta es esto" (D-061).
        baseTexto: formatearPesos(importe.baseCentavos),
        recargoTexto: formatearPesos(importe.recargoCentavos),
        recargoBps: importe.recargoBps,
        recargoPorcentajeTexto: textoDeRecargo(importe.recargoBps),
        formaDePago: forma ? { codigo: forma.codigo, nombre: forma.nombre } : null,
        vendido: resumirItems(items),
        link: linkDeSaldo(
          resultado.clienteId,
          (await prisma.cliente.findUniqueOrThrow({ where: { id: resultado.clienteId } }))
            .tokenVersion,
        ),
        ...resumen,
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Anulación: genera el movimiento inverso. Nunca borra (D-004). */
  router.post('/:id/anular', exigeRol('GERENTE', 'VENDEDOR'), async (req, res, next) => {
    try {
      const motivo = z.object({ motivo: z.string().trim().min(3).max(200) }).parse(req.body).motivo;
      const pago = await prisma.pago.findUniqueOrThrow({ where: { id: String(req.params.id) } });
      if (pago.estado === 'ANULADO') {
        return res.json({ anulado: true, yaEstaba: true });
      }

      if (pago.estado === 'ACREDITADO') {
        const cuenta = await prisma.cuentaPuntos.findFirstOrThrow({
          where: { clienteId: pago.clienteId },
          orderBy: { creadoEn: 'desc' },
        });
        await motor.revertir({
          cuentaId: cuenta.id,
          referenciaExterna: pago.referenciaExterna,
          motivo,
          contexto: { usuarioId: req.sesion!.usuarioId, localId: req.sesion!.localId },
        });
      }

      await prisma.pago.update({
        where: { id: pago.id },
        data: { estado: 'ANULADO', anuladoEn: new Date(), motivoAnulado: motivo },
      });

      const resumen = await resumenDeCuenta(prisma, pago.clienteId, 5);
      return res.json({ anulado: true, yaEstaba: false, ...resumen });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Las formas de pago habilitadas, con su recargo (D-061). Las lee el mostrador
   * al abrir la pantalla: los botones no están escritos en el código, para que
   * cambiar un arancel no sea un despliegue.
   */
  router.get('/formas-de-pago', async (_req, res, next) => {
    try {
      const formas = await formasDePago(prisma, { soloActivas: true });
      return res.json({
        formas: formas.map((f) => ({
          codigo: f.codigo,
          nombre: f.nombre,
          medioDePago: f.medioDePago,
          recargoBps: f.recargoBps,
          recargoTexto: textoDeRecargo(f.recargoBps),
          cuotas: f.cuotas,
          acredita: f.medioDePago === 'EFECTIVO',
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Últimos cobros del local, para controlar la caja. */
  router.get('/recientes', async (req, res, next) => {
    try {
      const pagos = await prisma.pago.findMany({
        where: { localId: req.sesion!.localId },
        orderBy: { creadoEn: 'desc' },
        take: 20,
        include: { cliente: { select: { nombre: true, telefonoE164: true } } },
      });
      return res.json({
        pagos: pagos.map((p) => ({
          id: p.id,
          fecha: p.creadoEn,
          importeTexto: formatearPesos(p.importeCentavos),
          medioDePago: p.medioDePago,
          lineaDeNegocio: p.lineaDeNegocio,
          estado: p.estado,
          motivoAnulado: p.motivoAnulado,
          cliente: p.cliente.nombre,
          telefono: p.cliente.telefonoE164,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
