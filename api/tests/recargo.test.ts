/**
 * Recargo por forma de pago (D-061).
 *
 * Los números son los de la lista real de InCollege (D-049) con los recargos
 * que pasó la gerencia: 14% con QR, débito o un pago, 23% en tres cuotas, 35%
 * en seis.
 */
import { describe, expect, it } from 'vitest';
import { aplicarRecargo, formatearPesos, parsearPrecioDeLista } from '../src/dominio/dinero.js';
import { conRecargo, textoDeRecargo, FORMAS_INICIALES } from '../src/servicios/formasDePago.js';
import { ErrorDeNegocio } from '../src/dominio/tipos.js';

const precio = (pesos: string) => parsearPrecioDeLista(pesos);

describe('aplicarRecargo', () => {
  it('no recarga nada cuando la forma de pago no tiene recargo', () => {
    expect(aplicarRecargo(precio('41800'), 0)).toBe(0n);
  });

  it('cobra el 14% de la campera con tarjeta en un pago', () => {
    // $41.800 + 14% = $47.652
    const recargo = aplicarRecargo(precio('41800'), 1400);
    expect(formatearPesos(recargo)).toBe('$5.852');
    expect(formatearPesos(precio('41800') + recargo)).toBe('$47.652');
  });

  it('redondea el recargo al peso entero para que el total no tenga centavos', () => {
    // El 23% de $26.950 es $6.198,50: se cobra $6.199 y el total queda redondo.
    const recargo = aplicarRecargo(precio('26950'), 2300);
    expect(recargo % 100n).toBe(0n);
    expect(formatearPesos(recargo)).toBe('$6.199');
    expect(formatearPesos(precio('26950') + recargo)).toBe('$33.149');
  });

  it('cobra el 35% en seis cuotas', () => {
    // $29.700 + 35% = $40.095
    expect(formatearPesos(aplicarRecargo(precio('29700'), 3500))).toBe('$10.395');
  });

  it('no acepta un recargo negativo ni fraccionario en bps', () => {
    expect(() => aplicarRecargo(precio('9900'), -1)).toThrow(ErrorDeNegocio);
    expect(() => aplicarRecargo(precio('9900'), 14.5)).toThrow(ErrorDeNegocio);
  });
});

describe('conRecargo', () => {
  it('devuelve el desglose entero: lista, recargo y total', () => {
    const desglose = conRecargo({ recargoBps: 1400 }, precio('12650'));
    expect(desglose.baseCentavos + desglose.recargoCentavos).toBe(desglose.totalCentavos);
    expect(formatearPesos(desglose.baseCentavos)).toBe('$12.650');
    expect(formatearPesos(desglose.recargoCentavos)).toBe('$1.771');
    expect(formatearPesos(desglose.totalCentavos)).toBe('$14.421');
  });

  it('en efectivo el total es el precio de lista', () => {
    const efectivo = FORMAS_INICIALES.find((f) => f.codigo === 'efectivo')!;
    const desglose = conRecargo(efectivo, precio('9900'));
    expect(desglose.recargoCentavos).toBe(0n);
    expect(desglose.totalCentavos).toBe(precio('9900'));
  });

  /**
   * El efectivo es el único medio que acredita puntos (D-001). Si tuviera
   * recargo, los puntos se calcularían sobre un importe inflado: la regla de
   * negocio deja de ser "un punto cada $10.000 gastados".
   */
  it('ninguna forma que acredita puntos tiene recargo', () => {
    const queAcreditan = FORMAS_INICIALES.filter((f) => f.medioDePago === 'EFECTIVO');
    expect(queAcreditan.length).toBeGreaterThan(0);
    for (const forma of queAcreditan) {
      expect(forma.recargoBps).toBe(0);
    }
  });

  it('las formas iniciales son las que pasó la gerencia', () => {
    const porCodigo = Object.fromEntries(FORMAS_INICIALES.map((f) => [f.codigo, f.recargoBps]));
    expect(porCodigo).toMatchObject({
      efectivo: 0,
      transferencia: 0,
      debito: 1400,
      qr: 1400,
      'credito-1': 1400,
      'credito-3': 2300,
      'credito-6': 3500,
    });
  });

  it('los códigos no se repiten: el código es lo que queda escrito en el pago', () => {
    const codigos = FORMAS_INICIALES.map((f) => f.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe('textoDeRecargo', () => {
  it('escribe el porcentaje como lo lee una persona', () => {
    expect(textoDeRecargo(0)).toBe('sin recargo');
    expect(textoDeRecargo(1400)).toBe('14%');
    expect(textoDeRecargo(3500)).toBe('35%');
    expect(textoDeRecargo(1450)).toBe('14,50%');
  });
});
