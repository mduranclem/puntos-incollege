import { describe, expect, it } from 'vitest';
import { aplicarBps, formatearPesos, parsearImporte } from '../src/dominio/dinero.js';
import { topeDeLaVenta } from '../src/dominio/reglas.js';

describe('parseo de importes que tipea el vendedor', () => {
  it('acepta los formatos usuales del mostrador', () => {
    expect(parsearImporte('25000')).toBe(2_500_000n);
    expect(parsearImporte('25.000')).toBe(2_500_000n);
    expect(parsearImporte('$ 25.000')).toBe(2_500_000n);
    expect(parsearImporte('25.000,50')).toBe(2_500_050n);
    expect(parsearImporte('25000,5')).toBe(2_500_050n);
    expect(parsearImporte('9900')).toBe(990_000n);
    expect(parsearImporte('12,65')).toBe(1_265n);
  });

  it('no pierde centavos (nada de float, D-002)', () => {
    const suma = parsearImporte('0,10') + parsearImporte('0,20');
    expect(suma).toBe(30n);
    expect(formatearPesos(suma)).toBe('$0,30');
  });

  it('rechaza basura y más de dos decimales', () => {
    expect(() => parsearImporte('')).toThrow();
    expect(() => parsearImporte('mil pesos')).toThrow();
    expect(() => parsearImporte('10,123')).toThrow();
  });

  it('formatea con separador de miles rioplatense', () => {
    expect(formatearPesos(2_500_000n)).toBe('$25.000');
    expect(formatearPesos(4_180_000n)).toBe('$41.800');
    expect(formatearPesos(-100_000n)).toBe('-$1.000');
  });
});

describe('tope en puntos básicos', () => {
  it('el 10% de la campera de $41.800 es $4.180', () => {
    expect(aplicarBps(parsearImporte('41800'), 1000)).toBe(parsearImporte('4180'));
  });

  it('redondea hacia abajo, nunca a favor del canje', () => {
    expect(aplicarBps(parsearImporte('9900'), 1000)).toBe(parsearImporte('990'));
    expect(aplicarBps(1n, 1000)).toBe(0n);
  });
});

describe('tope del canje sobre la venta (D-025)', () => {
  it('sin tope: los puntos pueden pagar la prenda entera', () => {
    const campera = parsearImporte('41800');
    expect(topeDeLaVenta(campera, 10_000)).toBe(campera);
  });

  it('nunca se pasa del total, aunque se configure de más', () => {
    const chomba = parsearImporte('26950');
    expect(topeDeLaVenta(chomba, 20_000)).toBe(chomba);
    expect(topeDeLaVenta(chomba, 100_000)).toBe(chomba);
  });

  it('con un tope menor, manda el tope', () => {
    expect(topeDeLaVenta(parsearImporte('41800'), 1000)).toBe(parsearImporte('4180'));
  });
});
