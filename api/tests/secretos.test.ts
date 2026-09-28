/**
 * El guardián de secretos (D-044).
 *
 * Es el arreglo más importante de la auditoría, así que va con test: lo que se
 * prueba es que **falle**, que es justo lo que antes no hacía.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { secretoObligatorio } from '../src/dominio/secretos.js';

const original = process.env.JWT_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = original;
});

describe('el sistema no firma sesiones sin un secreto propio', () => {
  it('tira si la variable falta', () => {
    delete process.env.JWT_SECRET;
    expect(() => secretoObligatorio('JWT_SECRET')).toThrow(/Falta JWT_SECRET/);
  });

  it('tira si está vacía o son espacios', () => {
    for (const vacio of ['', '   ']) {
      process.env.JWT_SECRET = vacio;
      expect(() => secretoObligatorio('JWT_SECRET')).toThrow(/Falta JWT_SECRET/);
    }
  });

  it('tira con el valor de ejemplo del repositorio, que es público', () => {
    process.env.JWT_SECRET = 'cambiar-en-produccion';
    expect(() => secretoObligatorio('JWT_SECRET')).toThrow(/público/);
  });

  it('tampoco acepta el de ejemplo con algo pegado atrás', () => {
    process.env.JWT_SECRET = 'cambiar-en-produccion-2026';
    expect(() => secretoObligatorio('JWT_SECRET')).toThrow(/público/);
  });

  it('tira si es demasiado corto para servir de algo', () => {
    process.env.JWT_SECRET = 'corto';
    expect(() => secretoObligatorio('JWT_SECRET')).toThrow(/al menos/);
  });

  it('acepta uno largo y propio, sin espacios alrededor', () => {
    process.env.JWT_SECRET = '  zHW-PFCceHuKZHntzBXOM4McXxOSgA86w-DbAlf4  ';
    expect(secretoObligatorio('JWT_SECRET')).toBe('zHW-PFCceHuKZHntzBXOM4McXxOSgA86w-DbAlf4');
  });
});
