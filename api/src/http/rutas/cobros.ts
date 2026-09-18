/**
 * Cobro en el mostrador. Es la pantalla que se usa con gente esperando, así que
 * es un solo viaje: busca o da de alta al cliente, registra el pago y —si fue en
 * efectivo— acredita los puntos y devuelve el saldo actualizado.
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
import { MEDIOS_DE_PAGO, LINEAS_HABILITADAS, ErrorDeNegocio } from '../../dominio/tipos.js';

const motor = new MotorDePuntos(new RepositorioPrisma(prisma));
const ingestor = new IngestorDePagos(prisma, motor);

const Cobro = z.object({
  telefono: z.string().min(3),
  nombre: z.string().trim().max(120).optional(),
  importe: z.string().min(1),
  medioDePago: z.enum(MEDIOS_DE_PAGO),
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
      const importeCentavos = parsearImporte(datos.importe);
      if (importeCentavos <= 0n) {
        throw new ErrorDeNegocio('IMPORTE_INVALIDO', 'El importe tiene que ser mayor a cero');
      }
      if (!LINEAS_HABILITADAS.includes(datos.lineaDeNegocio)) {
        throw new ErrorDeNegocio('LINEA_NO_HABILITADA', 'Esa línea no participa del programa');
      }

      const resultado = await ingestor.ingerir({
        referenciaExterna: `manual:${datos.referencia ?? randomUUID()}`,
        ocurridoEn: new Date(),
        importeCentavos,
        medioDePago: datos.medioDePago,
        lineaDeNegocio: datos.lineaDeNegocio,
        localCodigo: sesion.localCodigo,
        cliente: { telefonoCrudo: datos.telefono, nombre: datos.nombre },
        usuarioId: sesion.usuarioId,
        metadata: { cargadoPor: sesion.usuario, local: sesion.localNombre },
      });

      const resumen = await resumenDeCuenta(prisma, resultado.clienteId, 5);

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
        acredito: resultado.acredito,
        yaAplicado: resultado.yaAplicado,
        puntosAcreditados: resultado.puntosAcreditados,
        clienteNuevo: resultado.clienteNuevo,
        importeTexto: formatearPesos(importeCentavos),
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
