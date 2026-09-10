/**
 * Motor de puntos. Orquesta las reglas puras contra el libro mayor.
 *
 * Invariantes que sostiene:
 *  - Libro mayor append-only: nunca hace UPDATE de saldo; la caché se recalcula (D-004).
 *  - Idempotencia por `referenciaExterna` + tipo de movimiento (D-006).
 *  - Nada se borra: anular un pago genera un movimiento REVERSA (D-004).
 *  - Todo canje corre con la fila de la cuenta bloqueada (D-007).
 *  - Cada movimiento guarda quién, dónde y cuándo, y con qué tasa se calculó (D-009).
 */
import {
  calcularAcreditacion,
  calcularCanje,
  calcularReversa,
} from '../dominio/reglas.js';
import { BeneficioComercial, ErrorDeNegocio } from '../dominio/tipos.js';
import type {
  Contexto,
  EstadoDeCuenta,
  Movimiento,
  RepositorioPuntos,
  TxPuntos,
} from './puertos.js';

export type ResultadoOperacion = {
  movimiento: Movimiento | null;
  estado: EstadoDeCuenta;
  /** true si la operación ya se había aplicado antes (reintento inofensivo). */
  yaAplicado: boolean;
};

export type EntradaAcreditacion = {
  cuentaId: string;
  referenciaExterna: string;
  importeCentavos: bigint;
  centavosPorPunto: bigint;
  contexto: Contexto;
  metadata?: Record<string, unknown> | null;
};

export type EntradaCanje = {
  cuentaId: string;
  puntosPedidos: number;
  totalVentaCentavos: bigint;
  valorPuntoCentavos: bigint;
  topeCanjeBps: number;
  beneficiosAplicados: BeneficioComercial[];
  /** Referencia de la venta, si la hay. Da idempotencia al canje. */
  referenciaExterna?: string | null;
  motivo?: string | null;
  contexto: Contexto;
};

export type EntradaReversa = {
  cuentaId: string;
  /** Referencia del pago que se anula. */
  referenciaExterna: string;
  motivo: string;
  contexto: Contexto;
};

export type EntradaVencimiento = {
  cuentaId: string;
  temporadaId: string;
  contexto: Contexto;
};

export type EntradaAjuste = {
  cuentaId: string;
  puntos: number;
  motivo: string;
  referenciaExterna?: string | null;
  contexto: Contexto;
};

export class MotorDePuntos {
  constructor(private readonly repo: RepositorioPuntos) {}

  /**
   * Acredita un pago. Reintentar con la misma `referenciaExterna` no duplica
   * puntos: devuelve el movimiento que ya existía.
   */
  async acreditar(entrada: EntradaAcreditacion): Promise<ResultadoOperacion> {
    const { cuentaId, referenciaExterna, importeCentavos, centavosPorPunto, contexto } = entrada;

    return this.repo.conCuentaBloqueada(cuentaId, async (tx) => {
      const yaEstaba = await tx.buscarMovimiento('ACREDITACION', referenciaExterna);
      if (yaEstaba) {
        return { movimiento: yaEstaba, estado: await tx.estadoDeCuenta(cuentaId), yaAplicado: true };
      }

      const estado = await tx.estadoDeCuenta(cuentaId);
      const calculo = calcularAcreditacion(
        estado.remanenteCentavos,
        importeCentavos,
        centavosPorPunto,
      );

      const movimiento = await tx.insertarMovimiento({
        cuentaId,
        tipo: 'ACREDITACION',
        puntos: calculo.puntos,
        montoOrigenCentavos: importeCentavos,
        remanenteResultanteCentavos: calculo.remanenteResultanteCentavos,
        referenciaExterna,
        centavosPorPuntoAplicado: centavosPorPunto,
        valorPuntoAplicadoCentavos: null,
        movimientoRevertidoId: null,
        motivo: null,
        localId: contexto.localId,
        usuarioId: contexto.usuarioId,
        creadoEn: contexto.ocurridoEn ?? new Date(),
        metadata: entrada.metadata ?? null,
      });

      return this.cerrar(tx, cuentaId, movimiento);
    });
  }

  /**
   * Canje de puntos por descuento en pesos. El saldo se verifica **dentro** de la
   * transacción, con la cuenta bloqueada: dos cajas no pueden gastar lo mismo.
   */
  async canjear(entrada: EntradaCanje): Promise<ResultadoOperacion & { descuentoCentavos: bigint }> {
    const { cuentaId, referenciaExterna, contexto } = entrada;

    return this.repo.conCuentaBloqueada(cuentaId, async (tx) => {
      if (referenciaExterna) {
        const yaEstaba = await tx.buscarMovimiento('CANJE', referenciaExterna);
        if (yaEstaba) {
          return {
            movimiento: yaEstaba,
            estado: await tx.estadoDeCuenta(cuentaId),
            yaAplicado: true,
            descuentoCentavos: BigInt(-yaEstaba.puntos) * (yaEstaba.valorPuntoAplicadoCentavos ?? 0n),
          };
        }
      }

      const estado = await tx.estadoDeCuenta(cuentaId);
      const calculo = calcularCanje({
        totalVentaCentavos: entrada.totalVentaCentavos,
        puntosPedidos: entrada.puntosPedidos,
        saldoDisponible: estado.saldoPuntos,
        valorPuntoCentavos: entrada.valorPuntoCentavos,
        topeCanjeBps: entrada.topeCanjeBps,
        beneficiosAplicados: entrada.beneficiosAplicados,
      });

      const movimiento = await tx.insertarMovimiento({
        cuentaId,
        tipo: 'CANJE',
        puntos: calculo.puntos,
        montoOrigenCentavos: entrada.totalVentaCentavos,
        remanenteResultanteCentavos: estado.remanenteCentavos, // el canje no toca el remanente
        referenciaExterna: referenciaExterna ?? null,
        centavosPorPuntoAplicado: null,
        valorPuntoAplicadoCentavos: entrada.valorPuntoCentavos,
        movimientoRevertidoId: null,
        motivo: entrada.motivo ?? null,
        localId: contexto.localId,
        usuarioId: contexto.usuarioId,
        creadoEn: contexto.ocurridoEn ?? new Date(),
        metadata: {
          topeCanjeBps: entrada.topeCanjeBps,
          topeCentavos: calculo.topeCentavos.toString(),
          descuentoCentavos: calculo.descuentoCentavos.toString(),
          beneficiosDeclarados: entrada.beneficiosAplicados,
        },
      });

      const cerrado = await this.cerrar(tx, cuentaId, movimiento);
      return { ...cerrado, descuentoCentavos: calculo.descuentoCentavos };
    });
  }

  /**
   * Anula un pago ya acreditado generando el movimiento inverso. Nunca borra.
   * Reintentar la reversa del mismo pago es inofensivo.
   */
  async revertir(entrada: EntradaReversa): Promise<ResultadoOperacion> {
    const { cuentaId, referenciaExterna, contexto } = entrada;

    return this.repo.conCuentaBloqueada(cuentaId, async (tx) => {
      const yaRevertido = await tx.buscarMovimiento('REVERSA', referenciaExterna);
      if (yaRevertido) {
        return {
          movimiento: yaRevertido,
          estado: await tx.estadoDeCuenta(cuentaId),
          yaAplicado: true,
        };
      }

      const original = await tx.buscarMovimiento('ACREDITACION', referenciaExterna);
      if (!original) {
        throw new ErrorDeNegocio(
          'ACREDITACION_INEXISTENTE',
          `No hay una acreditación con la referencia ${referenciaExterna}`,
          { referenciaExterna },
        );
      }

      const estado = await tx.estadoDeCuenta(cuentaId);
      const calculo = calcularReversa(
        estado.remanenteCentavos,
        original.montoOrigenCentavos ?? 0n,
        original.puntos,
        original.centavosPorPuntoAplicado ?? 1n,
      );

      const movimiento = await tx.insertarMovimiento({
        cuentaId,
        tipo: 'REVERSA',
        puntos: calculo.puntos,
        montoOrigenCentavos: original.montoOrigenCentavos,
        remanenteResultanteCentavos: calculo.remanenteResultanteCentavos,
        referenciaExterna,
        centavosPorPuntoAplicado: original.centavosPorPuntoAplicado,
        valorPuntoAplicadoCentavos: null,
        movimientoRevertidoId: original.id,
        motivo: entrada.motivo,
        localId: contexto.localId,
        usuarioId: contexto.usuarioId,
        creadoEn: contexto.ocurridoEn ?? new Date(),
        metadata: null,
      });

      return this.cerrar(tx, cuentaId, movimiento);
    });
  }

  /**
   * Vence el saldo de la cuenta al cerrar la temporada. El remanente también
   * vence (D-013). Idempotente por temporada.
   */
  async vencer(entrada: EntradaVencimiento): Promise<ResultadoOperacion> {
    const { cuentaId, temporadaId, contexto } = entrada;
    const referencia = `vencimiento:${temporadaId}:${cuentaId}`;

    return this.repo.conCuentaBloqueada(cuentaId, async (tx) => {
      const yaVencido = await tx.buscarMovimiento('VENCIMIENTO', referencia);
      if (yaVencido) {
        return {
          movimiento: yaVencido,
          estado: await tx.estadoDeCuenta(cuentaId),
          yaAplicado: true,
        };
      }

      const estado = await tx.estadoDeCuenta(cuentaId);
      if (estado.saldoPuntos <= 0 && estado.remanenteCentavos === 0n) {
        return { movimiento: null, estado, yaAplicado: false };
      }

      const movimiento = await tx.insertarMovimiento({
        cuentaId,
        tipo: 'VENCIMIENTO',
        puntos: -Math.max(0, estado.saldoPuntos),
        montoOrigenCentavos: null,
        remanenteResultanteCentavos: 0n,
        referenciaExterna: referencia,
        centavosPorPuntoAplicado: null,
        valorPuntoAplicadoCentavos: null,
        movimientoRevertidoId: null,
        motivo: `Cierre de temporada ${temporadaId}`,
        localId: contexto.localId,
        usuarioId: contexto.usuarioId,
        creadoEn: contexto.ocurridoEn ?? new Date(),
        metadata: {
          saldoVencido: Math.max(0, estado.saldoPuntos),
          remanenteVencidoCentavos: estado.remanenteCentavos.toString(),
        },
      });

      return this.cerrar(tx, cuentaId, movimiento);
    });
  }

  /** Ajuste manual con motivo obligatorio. Queda auditado como cualquier otro movimiento. */
  async ajustar(entrada: EntradaAjuste): Promise<ResultadoOperacion> {
    const { cuentaId, contexto } = entrada;
    if (!Number.isInteger(entrada.puntos) || entrada.puntos === 0) {
      throw new ErrorDeNegocio('AJUSTE_INVALIDO', 'El ajuste debe ser un entero distinto de cero');
    }
    if (!entrada.motivo?.trim()) {
      throw new ErrorDeNegocio('AJUSTE_INVALIDO', 'El ajuste necesita un motivo');
    }

    return this.repo.conCuentaBloqueada(cuentaId, async (tx) => {
      if (entrada.referenciaExterna) {
        const yaEstaba = await tx.buscarMovimiento('AJUSTE', entrada.referenciaExterna);
        if (yaEstaba) {
          return {
            movimiento: yaEstaba,
            estado: await tx.estadoDeCuenta(cuentaId),
            yaAplicado: true,
          };
        }
      }
      const estado = await tx.estadoDeCuenta(cuentaId);
      const movimiento = await tx.insertarMovimiento({
        cuentaId,
        tipo: 'AJUSTE',
        puntos: entrada.puntos,
        montoOrigenCentavos: null,
        remanenteResultanteCentavos: estado.remanenteCentavos,
        referenciaExterna: entrada.referenciaExterna ?? null,
        centavosPorPuntoAplicado: null,
        valorPuntoAplicadoCentavos: null,
        movimientoRevertidoId: null,
        motivo: entrada.motivo,
        localId: contexto.localId,
        usuarioId: contexto.usuarioId,
        creadoEn: contexto.ocurridoEn ?? new Date(),
        metadata: null,
      });
      return this.cerrar(tx, cuentaId, movimiento);
    });
  }

  /** Recalcula el estado desde el libro mayor y refresca la caché. */
  private async cerrar(
    tx: TxPuntos,
    cuentaId: string,
    movimiento: Movimiento,
  ): Promise<ResultadoOperacion> {
    const estado = await tx.estadoDeCuenta(cuentaId);
    await tx.refrescarCache(cuentaId, estado);
    return { movimiento, estado, yaAplicado: false };
  }
}
