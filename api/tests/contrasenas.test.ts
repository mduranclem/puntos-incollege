/**
 * La política de contraseñas y el freno a los intentos (D-034).
 *
 * Son las dos cosas que separan la caja de cualquiera que se siente en la
 * computadora del mostrador, así que van con test.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LARGO_MINIMO,
  LARGO_MINIMO_SOLO_NUMEROS,
  contrasenaValida,
  motivoContrasenaInvalida,
} from '../src/dominio/contrasenas.js';
import {
  ESPERA_MAXIMA_SEG,
  INTENTOS_LIBRES,
  OLVIDO_MIN,
  esperaPendiente,
  olvidarTodo,
  registrarExito,
  registrarFallo,
} from '../src/servicios/intentosDeIngreso.js';

describe('qué se acepta como contraseña', () => {
  it('acepta una frase común y corriente', () => {
    expect(contrasenaValida('remeras del norte')).toBe(true);
    expect(contrasenaValida('Chomba2026!')).toBe(true);
  });

  it('rechaza las cortas', () => {
    expect(contrasenaValida('corta1')).toBe(false);
    expect(motivoContrasenaInvalida('corta1')).toContain(String(LARGO_MINIMO));
  });

  it('rechaza el PIN de seis dígitos que estamos sacando', () => {
    expect(contrasenaValida('427948')).toBe(false);
    // Tampoco alcanza con estirarlo hasta el mínimo de largo general.
    expect(contrasenaValida('42794812')).toBe(false);
    expect(motivoContrasenaInvalida('42794812')).toContain(String(LARGO_MINIMO_SOLO_NUMEROS));
    // Pero una tira larga de números sí sirve.
    expect(contrasenaValida('4279481234')).toBe(true);
  });

  it('rechaza las obvias', () => {
    for (const mala of ['password', '12345678', 'incollege', 'mostrador', 'Contraseña']) {
      expect(contrasenaValida(mala), mala).toBe(false);
    }
  });

  it('no deja usar el propio nombre de usuario', () => {
    expect(contrasenaValida('mostrador-ros-sur', { usuario: 'mostrador-ros-sur' })).toBe(false);
    expect(contrasenaValida('yo-soy-admin-2026', { usuario: 'admin' })).toBe(false);
    expect(contrasenaValida('remeras del norte', { usuario: 'admin' })).toBe(true);
  });

  it('rechaza el mismo carácter repetido', () => {
    expect(contrasenaValida('aaaaaaaaaa')).toBe(false);
  });

  it('rechaza espacios al principio o al final, que no se ven', () => {
    expect(contrasenaValida(' remeras del norte')).toBe(false);
    expect(contrasenaValida('remeras del norte ')).toBe(false);
  });

  it('rechaza lo que bcrypt no llegaría a mirar', () => {
    // bcrypt corta en 72 bytes: si aceptáramos más, dos contraseñas distintas
    // que compartan los primeros 72 entrarían las dos.
    expect(contrasenaValida('a'.repeat(72) + 'b')).toBe(false);
    expect(contrasenaValida('ñ'.repeat(40))).toBe(false); // 80 bytes
  });
});

describe('freno a los intentos de ingreso', () => {
  beforeEach(() => olvidarTodo());

  it('los primeros errores no hacen esperar', () => {
    for (let i = 0; i < INTENTOS_LIBRES; i++) {
      expect(registrarFallo('admin')).toBe(0);
    }
    expect(esperaPendiente('admin')).toBe(0);
  });

  it('después la espera crece', () => {
    for (let i = 0; i < INTENTOS_LIBRES; i++) registrarFallo('admin');
    expect(registrarFallo('admin')).toBe(5);
    expect(registrarFallo('admin')).toBe(10);
    expect(registrarFallo('admin')).toBe(20);
    expect(registrarFallo('admin')).toBe(40);
  });

  it('la espera tiene techo: nunca deja un local sin poder cobrar', () => {
    for (let i = 0; i < 40; i++) registrarFallo('admin');
    expect(registrarFallo('admin')).toBe(ESPERA_MAXIMA_SEG);
  });

  it('entrar bien borra el historial', () => {
    for (let i = 0; i < 10; i++) registrarFallo('admin');
    expect(esperaPendiente('admin')).toBeGreaterThan(0);
    registrarExito('admin');
    expect(esperaPendiente('admin')).toBe(0);
  });

  it('cuenta por usuario: un vendedor trabado no traba a los demás', () => {
    for (let i = 0; i < 10; i++) registrarFallo('mostrador-ros-sur');
    expect(esperaPendiente('mostrador-ros-sur')).toBeGreaterThan(0);
    expect(esperaPendiente('mostrador-fisherton')).toBe(0);
  });

  it('no distingue mayúsculas: es el mismo usuario', () => {
    for (let i = 0; i < 10; i++) registrarFallo('Admin');
    expect(esperaPendiente('admin')).toBeGreaterThan(0);
  });

  it('se olvida solo con el tiempo', () => {
    const ahora = Date.now();
    for (let i = 0; i < 10; i++) registrarFallo('admin', ahora);
    expect(esperaPendiente('admin', ahora)).toBeGreaterThan(0);
    expect(esperaPendiente('admin', ahora + (OLVIDO_MIN + 1) * 60_000)).toBe(0);
  });

  it('la espera se agota sola sin tener que fallar de nuevo', () => {
    const ahora = Date.now();
    for (let i = 0; i < INTENTOS_LIBRES + 1; i++) registrarFallo('admin', ahora);
    expect(esperaPendiente('admin', ahora)).toBe(5);
    expect(esperaPendiente('admin', ahora + 6_000)).toBe(0);
  });
});
