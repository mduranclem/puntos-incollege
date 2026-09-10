import { describe, expect, it } from 'vitest';
import {
  formatearTelefono,
  normalizarTelefono,
  esTelefonoValido,
} from '../src/dominio/telefono.js';

describe('normalización de teléfonos a E.164', () => {
  it('el mismo número de Rosario en todos los formatos da una sola cuenta', () => {
    const formatos = [
      '3415551234',
      '341 555-1234',
      '0341 15 555 1234',
      '(0341) 15-5551234',
      '+54 9 341 555 1234',
      '+549341 555 1234',
      '54 9 341 555 1234',
      '5493415551234',
      '0 341 15 555.1234',
      '00 54 9 341 555 1234',
    ];
    const normalizados = new Set(formatos.map((f) => normalizarTelefono(f)));
    expect([...normalizados]).toEqual(['+5493415551234']);
  });

  it('completa el código de área del local cuando el cliente da sólo el abonado', () => {
    expect(normalizarTelefono('5551234', { areaPorDefecto: '341' })).toBe('+5493415551234');
    expect(normalizarTelefono('15 555 1234', { areaPorDefecto: '341' })).toBe('+5493415551234');
    expect(normalizarTelefono('155551234', { areaPorDefecto: '341' })).toBe('+5493415551234');
  });

  it('el área por defecto distingue locales: el mismo abonado en Santa Fe es otra cuenta', () => {
    const rosario = normalizarTelefono('5551234', { areaPorDefecto: '341' });
    const santaFe = normalizarTelefono('5551234', { areaPorDefecto: '342' });
    const sanNicolas = normalizarTelefono('5551234', { areaPorDefecto: '336' });
    expect(new Set([rosario, santaFe, sanNicolas]).size).toBe(3);
    expect(santaFe).toBe('+5493425551234');
    expect(sanNicolas).toBe('+5493365551234');
  });

  it('maneja códigos de área de 2 y 4 dígitos', () => {
    expect(normalizarTelefono('011 15 4444-5555')).toBe('+5491144445555');
    expect(normalizarTelefono('+54 9 11 4444 5555')).toBe('+5491144445555');
    expect(normalizarTelefono('03462 15 44-5566')).toBe('+5493462445566');
    expect(normalizarTelefono('3462445566')).toBe('+5493462445566');
  });

  it('no confunde un 15 que es parte del abonado', () => {
    // 341 15 5-1234 no existe: el abonado real de 7 dígitos empieza con 15
    expect(normalizarTelefono('3411512345')).toBe('+5493411512345');
  });

  it('rechaza lo que no es un teléfono', () => {
    for (const basura of ['', '   ', 'no tengo', '123', 'abc-def']) {
      expect(esTelefonoValido(basura)).toBe(false);
    }
  });

  it('pide el área cuando no se puede deducir', () => {
    expect(() => normalizarTelefono('5551234')).toThrowError(/área/i);
  });

  it('deja pasar números de otros países sin tocarlos', () => {
    expect(normalizarTelefono('+598 99 123 456')).toBe('+59899123456');
    expect(normalizarTelefono('+1 (305) 555-0199')).toBe('+13055550199');
  });

  it('formatea para mostrar en pantalla', () => {
    expect(formatearTelefono('+5493415551234')).toBe('+54 9 341 555-1234');
    expect(formatearTelefono('+5491144445555')).toBe('+54 9 11 4444-5555');
  });
});
