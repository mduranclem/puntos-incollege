/**
 * El mail con el que el cliente entra a la app (D-036).
 *
 * Lo que se prueba acá es sobre todo la normalización: que el mismo mail
 * escrito de dos formas sea el mismo mail. Si no, la clienta se registra con
 * "Maria@Gmail.com" y al mes no puede entrar con "maria@gmail.com".
 */
import { describe, expect, it } from 'vitest';
import { emailValido, motivoEmailInvalido, normalizarEmail } from '../src/dominio/email.js';

describe('normalización del mail', () => {
  it('el mismo mail escrito de cualquier forma es el mismo', () => {
    const esperado = 'maria.gonzalez@gmail.com';
    for (const escrito of [
      'maria.gonzalez@gmail.com',
      'Maria.Gonzalez@Gmail.com',
      '  maria.gonzalez@gmail.com  ',
      'MARIA.GONZALEZ@GMAIL.COM',
    ]) {
      expect(normalizarEmail(escrito), escrito).toBe(esperado);
    }
  });

  it('no toca los puntos ni el "+": son parte del mail', () => {
    expect(normalizarEmail('maria+puntos@gmail.com')).toBe('maria+puntos@gmail.com');
  });
});

describe('qué se acepta como mail', () => {
  it('acepta los que usa la gente', () => {
    for (const bueno of [
      'maria@gmail.com',
      'maria.gonzalez@hotmail.com.ar',
      'maria+puntos@gmail.com',
      'm@incollege.com.ar',
    ]) {
      expect(emailValido(bueno), bueno).toBe(true);
    }
  });

  it('rechaza los errores de tipeo comunes', () => {
    for (const malo of ['maria', 'maria@', '@gmail.com', 'maria@gmail', 'maria gonzalez@gmail.com']) {
      expect(emailValido(malo), malo).toBe(false);
    }
  });

  it('el mensaje dice qué pasa, porque se le muestra a la clienta', () => {
    expect(motivoEmailInvalido('')).toContain('Escribí');
    expect(motivoEmailInvalido('maria@gmail')).toContain('bien escrito');
  });
});
