/**
 * Precios de lista (D-049).
 *
 * Un precio lo tipea una persona en el panel y después lo cobra la caja. Lo que
 * se cuela acá termina en un ticket.
 */
import { describe, expect, it } from 'vitest';
import { parsearPrecioDeLista } from '../src/dominio/dinero.js';
import { TALLES, TALLE_BASE } from '../src/dominio/tipos.js';

describe('parsearPrecioDeLista', () => {
  it('convierte pesos enteros a centavos', () => {
    expect(parsearPrecioDeLista('26950')).toBe(2695000n);
    expect(parsearPrecioDeLista(9900)).toBe(990000n);
  });

  it('acepta los puntos de miles, que es como se escribe un precio', () => {
    expect(parsearPrecioDeLista('26.950')).toBe(2695000n);
    expect(parsearPrecioDeLista('$ 41.800')).toBe(4180000n);
  });

  it('rechaza los centavos: un precio de lista no los tiene', () => {
    expect(() => parsearPrecioDeLista('26950,5')).toThrow(/no es un precio entero/);
    expect(() => parsearPrecioDeLista('26950,50')).toThrow(/no es un precio entero/);
  });

  /**
   * El caso que casi se escapa. Borrar los puntos sin mirar dónde están
   * convertía "26950.50" en 2.695.050: cien veces el precio, guardado en
   * silencio. El punto sólo vale si agrupa de a tres.
   */
  it('no confunde un punto decimal con un separador de miles', () => {
    expect(() => parsearPrecioDeLista('26950.50')).toThrow(/no es un precio entero/);
    expect(() => parsearPrecioDeLista('26950.5')).toThrow(/no es un precio entero/);
    expect(() => parsearPrecioDeLista('1.23')).toThrow(/no es un precio entero/);
    // Y el que sí es separador de miles sigue andando.
    expect(parsearPrecioDeLista('1.234.567')).toBe(123456700n);
  });

  it('rechaza cero y negativos', () => {
    expect(() => parsearPrecioDeLista('0')).toThrow(/mayor a cero/);
    expect(() => parsearPrecioDeLista('000')).toThrow(/mayor a cero/);
    expect(() => parsearPrecioDeLista('-500')).toThrow(/no es un precio entero/);
  });

  it('rechaza lo que no es un número', () => {
    for (const basura of ['', '   ', 'abc', '12abc', '1e5', 'NaN', 'Infinity']) {
      expect(() => parsearPrecioDeLista(basura)).toThrow();
    }
  });

  it('rechaza un número absurdamente grande en vez de guardarlo', () => {
    // Diez dígitos: más de mil millones de pesos por una chomba es un dedazo.
    expect(() => parsearPrecioDeLista('1234567890')).toThrow(/no es un precio entero/);
  });

  it('no pierde precisión en el precio más caro de la lista', () => {
    expect(parsearPrecioDeLista('49500')).toBe(4950000n);
  });
});

describe('talles', () => {
  it('van de más chico a más grande, y ESP último', () => {
    expect([...TALLES]).toEqual(['4-10', '12-16', 'S-XL', 'ESP']);
  });

  it('el talle base es el primero: es el precio de entrada del artículo', () => {
    expect(TALLE_BASE).toBe(TALLES[0]);
  });

  it('no hay talles repetidos', () => {
    expect(new Set(TALLES).size).toBe(TALLES.length);
  });
});
