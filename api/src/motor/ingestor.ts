/**
 * Ingestor de pagos: el único camino por el que un pago llega al motor (D-003).
 *
 * Recibe `PagoNormalizado` venga de donde venga —hoy la carga manual del
 * mostrador, mañana el sistema de egresados— resuelve cliente y cuenta, registra
 * el pago y lo acredita si corresponde. El motor nunca sabe de la fuente.
 *
 * Para acreditar hacen falta dos cosas, y las dos se deciden acá:
 *
 *  1. que el pago sea en **efectivo** (D-001), y
 *  2. que el cliente **tenga cuenta en la app** (D-059).
 *
 * Lo que no acredita se registra igual, con estado `NO_ACREDITABLE` y el motivo
 * en la respuesta: la venta tiene que quedar en el registro diario aunque no
 * sume un punto.
 */
import type { PrismaClient } from '@prisma/client';
import {
  ErrorDeNegocio,
  LINEAS_HABILITADAS,
  MEDIO_QUE_ACREDITA,
} from '../dominio/tipos.js';
import { resolverCliente, cuentaVigente } from '../servicios/clientes.js';
import { configuracionVigente, tasaDeLinea } from '../servicios/configuracion.js';
import type { MotorDePuntos } from './motorPuntos.js';
import type { Cursor, FuenteDePagos, PagoNormalizado } from './puertos.js';

/** Por qué un cobro no sumó puntos. `null` cuando sí sumó. */
export type MotivoSinPuntos = 'NO_ES_EFECTIVO' | 'SIN_CUENTA';

export type ResultadoIngesta = {
  pagoId: string;
  clienteId: string;
  cuentaId: string;
  acredito: boolean;
  motivoSinPuntos: MotivoSinPuntos | null;
  puntosAcreditados: number;
  saldoPuntos: number;
  remanenteCentavos: bigint;
  yaAplicado: boolean;
  nombreCliente: string;
  telefonoE164: string;
  clienteNuevo: boolean;
};

export class IngestorDePagos {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly motor: MotorDePuntos,
  ) {}

  async ingerir(pago: PagoNormalizado): Promise<ResultadoIngesta> {
    if (!LINEAS_HABILITADAS.includes(pago.lineaDeNegocio)) {
      throw new ErrorDeNegocio(
        'LINEA_NO_HABILITADA',
        `La línea ${pago.lineaDeNegocio} todavía no participa del programa de puntos`,
        { linea: pago.lineaDeNegocio },
      );
    }

    const local = await this.prisma.local.findUnique({ where: { codigo: pago.localCodigo } });
    if (!local) {
      throw new ErrorDeNegocio('LOCAL_INEXISTENTE', `No existe el local ${pago.localCodigo}`);
    }

    const cliente = await resolverCliente(this.prisma, {
      telefonoCrudo: pago.cliente.telefonoCrudo,
      nombre: pago.cliente.nombre,
      documento: pago.cliente.documento,
      localId: local.id,
      areaPorDefecto: local.codigoAreaPorDefecto,
    });
    const cuenta = await cuentaVigente(this.prisma, cliente.id);

    // Idempotencia a nivel pago: la referencia externa es única (D-006).
    const registrado = await this.prisma.pago.upsert({
      where: { referenciaExterna: pago.referenciaExterna },
      update: {},
      create: {
        referenciaExterna: pago.referenciaExterna,
        origen: pago.referenciaExterna.startsWith('siro:') ? 'SIRO' : 'MANUAL',
        estado: 'PENDIENTE',
        importeCentavos: pago.importeCentavos,
        medioDePago: pago.medioDePago,
        lineaDeNegocio: pago.lineaDeNegocio,
        ocurridoEn: pago.ocurridoEn,
        clienteId: cliente.id,
        localId: local.id,
        usuarioId: pago.usuarioId ?? null,
        metadata: (pago.metadata ?? undefined) as never,
      },
    });

    const base = {
      pagoId: registrado.id,
      clienteId: cliente.id,
      cuentaId: cuenta.id,
      nombreCliente: cliente.nombre,
      telefonoE164: cliente.telefonoE164,
      clienteNuevo: cliente.creado,
    };

    /**
     * Las dos razones por las que un cobro no suma. Se registra igual, para
     * tener el dato: lo que no acredita también es una venta.
     *
     * El orden importa en el mensaje, no en la regla: si pagó con tarjeta y
     * además no tiene cuenta, lo que hay que decirle es lo del efectivo, que es
     * lo que puede cambiar en esa misma compra.
     */
    const motivoSinPuntos: MotivoSinPuntos | null =
      pago.medioDePago !== MEDIO_QUE_ACREDITA
        ? 'NO_ES_EFECTIVO'
        : cliente.registradoEn === null
          ? 'SIN_CUENTA'
          : null;

    if (motivoSinPuntos) {
      await this.prisma.pago.update({
        where: { id: registrado.id },
        data: { estado: 'NO_ACREDITABLE', procesadoEn: new Date() },
      });
      const estado = await this.estadoActual(cuenta.id);
      return {
        ...base,
        acredito: false,
        motivoSinPuntos,
        puntosAcreditados: 0,
        yaAplicado: registrado.estado === 'NO_ACREDITABLE',
        ...estado,
      };
    }

    const config = await configuracionVigente(this.prisma);
    const resultado = await this.motor.acreditar({
      cuentaId: cuenta.id,
      referenciaExterna: pago.referenciaExterna,
      importeCentavos: pago.importeCentavos,
      centavosPorPunto: tasaDeLinea(config, pago.lineaDeNegocio),
      contexto: {
        usuarioId: pago.usuarioId ?? null,
        localId: local.id,
        ocurridoEn: pago.ocurridoEn,
      },
      metadata: { fuente: pago.referenciaExterna.split(':')[0] },
    });

    if (!resultado.yaAplicado) {
      await this.prisma.pago.update({
        where: { id: registrado.id },
        data: {
          estado: 'ACREDITADO',
          procesadoEn: new Date(),
          movimientoId: resultado.movimiento?.id ?? null,
        },
      });
    }

    return {
      ...base,
      acredito: true,
      motivoSinPuntos: null,
      puntosAcreditados: resultado.movimiento?.puntos ?? 0,
      saldoPuntos: resultado.estado.saldoPuntos,
      remanenteCentavos: resultado.estado.remanenteCentavos,
      yaAplicado: resultado.yaAplicado,
    };
  }

  /** Corrida por lotes: el camino que va a usar la fuente de egresados. */
  async procesarPendientes(
    fuente: FuenteDePagos,
    cursor: Cursor = { desde: null, ultimaReferencia: null },
    limite = 200,
  ): Promise<{ procesados: number; errores: Array<{ referencia: string; error: string }>; cursor: Cursor }> {
    const { pagos, cursor: siguiente } = await fuente.traerPagosNuevos(cursor, limite);
    const errores: Array<{ referencia: string; error: string }> = [];
    let procesados = 0;
    const listos: string[] = [];

    for (const pago of pagos) {
      try {
        await this.ingerir(pago);
        procesados++;
        listos.push(pago.referenciaExterna);
      } catch (error) {
        errores.push({
          referencia: pago.referenciaExterna,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (listos.length > 0) await fuente.marcarProcesados?.(listos);
    return { procesados, errores, cursor: siguiente };
  }

  private async estadoActual(cuentaId: string) {
    const cuenta = await this.prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } });
    return {
      saldoPuntos: cuenta.saldoCacheado,
      remanenteCentavos: cuenta.remanenteCentavos,
    };
  }
}
