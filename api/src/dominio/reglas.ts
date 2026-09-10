/**
 * Reglas de puntos, puras y sin efectos. Toda la aritmética del programa vive acá;
 * el motor sólo la orquesta contra el libro mayor.
 *
 * Ver DECISIONES.md § D-005 (remanente derivado) y § D-008 (un beneficio por operación).
 */
import { aplicarBps, dividirTecho } from './dinero.js';
import { BeneficioComercial, ErrorDeNegocio } from './tipos.js';

export type ResultadoAcreditacion = {
  puntos: number;
  remanenteResultanteCentavos: bigint;
};

/**
 *   base      = remanente anterior + importe
 *   puntos    = base / centavosPorPunto   (división entera)
 *   remanente = base − puntos × centavosPorPunto
 *
 * Ejemplo con $10.000 por punto: un pago de $25.000 acredita 2 puntos y deja
 * $5.000 de remanente; el próximo pago de $16.000 se calcula sobre $21.000,
 * acredita 2 puntos y deja $1.000.
 */
export function calcularAcreditacion(
  remanenteAnteriorCentavos: bigint,
  importeCentavos: bigint,
  centavosPorPunto: bigint,
): ResultadoAcreditacion {
  if (importeCentavos <= 0n) {
    throw new ErrorDeNegocio('IMPORTE_INVALIDO', 'El importe del pago debe ser positivo');
  }
  if (centavosPorPunto <= 0n) {
    throw new ErrorDeNegocio(
      'CONFIGURACION_INVALIDA',
      'La tasa de acumulación debe ser positiva',
    );
  }
  const base = remanenteAnteriorCentavos + importeCentavos;
  const puntos = base / centavosPorPunto;
  return {
    puntos: Number(puntos),
    remanenteResultanteCentavos: base - puntos * centavosPorPunto,
  };
}

export type ResultadoReversa = {
  /** Negativo: puntos que se devuelven al programa. */
  puntos: number;
  remanenteResultanteCentavos: bigint;
};

/**
 * Inversa exacta de la acreditación. Es lineal, así que sigue siendo correcta
 * aunque hayan entrado otros pagos después del que se anula.
 *
 * Si al descontar el importe el remanente quedaría negativo (porque ese remanente
 * ya se usó para completar puntos posteriores), se devuelven puntos de más hasta
 * que el remanente vuelva a ser no negativo.
 */
export function calcularReversa(
  remanenteActualCentavos: bigint,
  importeCentavos: bigint,
  puntosOriginales: number,
  centavosPorPunto: bigint,
): ResultadoReversa {
  if (centavosPorPunto <= 0n) {
    throw new ErrorDeNegocio(
      'CONFIGURACION_INVALIDA',
      'La tasa de acumulación debe ser positiva',
    );
  }
  let remanente =
    remanenteActualCentavos - importeCentavos + BigInt(puntosOriginales) * centavosPorPunto;
  let puntosADevolver = BigInt(puntosOriginales);

  if (remanente < 0n) {
    const extra = dividirTecho(-remanente, centavosPorPunto);
    remanente += extra * centavosPorPunto;
    puntosADevolver += extra;
  }

  return { puntos: -Number(puntosADevolver), remanenteResultanteCentavos: remanente };
}

export type PedidoDeCanje = {
  totalVentaCentavos: bigint;
  puntosPedidos: number;
  saldoDisponible: number;
  valorPuntoCentavos: bigint;
  /** Tope del canje sobre el total de la venta, en puntos básicos (1000 = 10%). */
  topeCanjeBps: number;
  beneficiosAplicados: BeneficioComercial[];
};

export type ResultadoCanje = {
  puntos: number;
  descuentoCentavos: bigint;
  topeCentavos: bigint;
};

/** Máximo de puntos canjeables en una venta, sin tirar error. Sirve para la UI. */
export function puntosMaximosCanjeables(
  totalVentaCentavos: bigint,
  saldoDisponible: number,
  valorPuntoCentavos: bigint,
  topeCanjeBps: number,
): number {
  if (valorPuntoCentavos <= 0n || saldoDisponible <= 0) return 0;
  const tope = aplicarBps(totalVentaCentavos, topeCanjeBps);
  const porTope = Number(tope / valorPuntoCentavos);
  return Math.max(0, Math.min(saldoDisponible, porTope));
}

export function calcularCanje(pedido: PedidoDeCanje): ResultadoCanje {
  const {
    totalVentaCentavos,
    puntosPedidos,
    saldoDisponible,
    valorPuntoCentavos,
    topeCanjeBps,
    beneficiosAplicados,
  } = pedido;

  // D-008: un solo beneficio por operación. Lo impide el sistema, no el vendedor.
  if (beneficiosAplicados.length > 0) {
    throw new ErrorDeNegocio(
      'BENEFICIOS_NO_ACUMULABLES',
      'El canje de puntos no se acumula con otros beneficios. Ya se aplicó: ' +
        beneficiosAplicados.join(', '),
      { beneficiosAplicados },
    );
  }
  if (!Number.isInteger(puntosPedidos) || puntosPedidos <= 0) {
    throw new ErrorDeNegocio('CANJE_INVALIDO', 'Los puntos a canjear deben ser un entero positivo');
  }
  if (totalVentaCentavos <= 0n) {
    throw new ErrorDeNegocio('CANJE_INVALIDO', 'El total de la venta debe ser positivo');
  }
  if (valorPuntoCentavos <= 0n) {
    throw new ErrorDeNegocio('CONFIGURACION_INVALIDA', 'El valor del punto debe ser positivo');
  }
  if (puntosPedidos > saldoDisponible) {
    throw new ErrorDeNegocio(
      'SALDO_INSUFICIENTE',
      `El saldo no alcanza: ${saldoDisponible} punto(s) disponible(s), se pidieron ${puntosPedidos}`,
      { saldoDisponible, puntosPedidos },
    );
  }

  const descuentoCentavos = BigInt(puntosPedidos) * valorPuntoCentavos;
  const topeCentavos = aplicarBps(totalVentaCentavos, topeCanjeBps);

  if (descuentoCentavos > topeCentavos) {
    throw new ErrorDeNegocio(
      'CANJE_SUPERA_TOPE',
      `El canje no puede superar el ${topeCanjeBps / 100}% de la compra`,
      {
        descuentoCentavos: descuentoCentavos.toString(),
        topeCentavos: topeCentavos.toString(),
        puntosMaximos: puntosMaximosCanjeables(
          totalVentaCentavos,
          saldoDisponible,
          valorPuntoCentavos,
          topeCanjeBps,
        ),
      },
    );
  }

  return { puntos: -puntosPedidos, descuentoCentavos, topeCentavos };
}
