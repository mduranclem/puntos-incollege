/**
 * El cierre de temporada es una fecha de calendario argentina (D-020).
 *
 * El bug que estos tests fijan: guardar la configuración sin cambiar la fecha la
 * corría un día hacia adelante cada vez, porque se escribía como instante local y
 * se leía como UTC. Sobre la fecha en que vencen los puntos de todos los clientes.
 */
import { describe, expect, it } from 'vitest';
import { esFechaSimple, fechaArgentina, finDelDiaArgentina } from '../src/dominio/fechas.js';

describe('cierre de temporada como fecha de calendario', () => {
  it('guardar y volver a leer devuelve la misma fecha (ida y vuelta)', () => {
    for (const fecha of ['2026-12-31', '2027-01-01', '2026-03-01', '2026-07-09']) {
      expect(fechaArgentina(finDelDiaArgentina(fecha))).toBe(fecha);
    }
  });

  it('guardar muchas veces seguidas no corre la fecha', () => {
    let fecha = '2026-12-31';
    for (let i = 0; i < 10; i++) {
      fecha = fechaArgentina(finDelDiaArgentina(fecha));
    }
    expect(fecha).toBe('2026-12-31');
  });

  it('el 31 de diciembre vence al final de ese día en Rosario, no al día siguiente', () => {
    const cierre = finDelDiaArgentina('2026-12-31');
    // Las 23:59 del 31 en Argentina son las 02:59 del 1 en UTC: el instante es correcto.
    expect(cierre.toISOString()).toBe('2027-01-01T02:59:59.999Z');
    // Pero la fecha de negocio sigue siendo el 31.
    expect(fechaArgentina(cierre)).toBe('2026-12-31');
  });

  it('un pago a las 23:00 del último día todavía entra en la temporada', () => {
    const cierre = finDelDiaArgentina('2026-12-31');
    const pago = new Date('2026-12-31T23:00:00-03:00');
    expect(pago.getTime()).toBeLessThan(cierre.getTime());
  });

  it('un pago del día siguiente ya quedó afuera', () => {
    const cierre = finDelDiaArgentina('2026-12-31');
    const pago = new Date('2027-01-01T00:30:00-03:00');
    expect(pago.getTime()).toBeGreaterThan(cierre.getTime());
  });

  it('rechaza lo que no es una fecha de calendario', () => {
    for (const basura of ['', '31/12/2026', '2026-12-31T23:59:59Z', 'ayer', '2026-13-40']) {
      expect(esFechaSimple(basura)).toBe(false);
    }
    expect(esFechaSimple('2026-12-31')).toBe(true);
  });
});
