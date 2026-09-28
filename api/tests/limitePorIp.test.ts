/**
 * El límite por IP (D-044). Es lo que impide que alguien use el WhatsApp de la
 * empresa para mandarle mensajes a medio Rosario, así que va con test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { limitePorIp, olvidarLimites } from '../src/servicios/limitePorIp.js';

/** Una respuesta de mentira que anota qué le hicieron. */
function respuestaFalsa() {
  const r = {
    estado: 0 as number,
    cuerpo: null as unknown,
    cabeceras: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      r.cabeceras[k] = v;
    },
    status(c: number) {
      r.estado = c;
      return r;
    },
    json(c: unknown) {
      r.cuerpo = c;
      return r;
    },
  };
  return r as unknown as Response & typeof r;
}

const pedido = (ip: string) => ({ ip, socket: {} }) as unknown as Request;

function correr(limitar: ReturnType<typeof limitePorIp>, ip: string) {
  const res = respuestaFalsa();
  const next = vi.fn() as unknown as NextFunction;
  limitar(pedido(ip), res, next);
  return { paso: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0, res };
}

const tres = () =>
  limitePorIp({ nombre: 'prueba', cuantos: 3, porMinutos: 60, mensaje: 'Esperá un rato.' });

describe('límite por IP', () => {
  beforeEach(() => olvidarLimites());

  it('deja pasar hasta el cupo', () => {
    const limitar = tres();
    for (let i = 0; i < 3; i++) {
      expect(correr(limitar, '1.1.1.1').paso, `pedido ${i + 1}`).toBe(true);
    }
  });

  it('frena el que se pasa, con 429 y cuánto falta', () => {
    const limitar = tres();
    for (let i = 0; i < 3; i++) correr(limitar, '1.1.1.1');

    const { paso, res } = correr(limitar, '1.1.1.1');
    expect(paso).toBe(false);
    expect(res.estado).toBe(429);
    expect(res.cabeceras['Retry-After']).toBeDefined();
    expect((res.cuerpo as { error: string }).error).toBe('DEMASIADOS_PEDIDOS');
  });

  it('una IP bloqueada no afecta a las demás', () => {
    const limitar = tres();
    for (let i = 0; i < 5; i++) correr(limitar, '1.1.1.1');
    expect(correr(limitar, '2.2.2.2').paso).toBe(true);
  });

  it('dos límites distintos llevan cuentas separadas', () => {
    const registro = limitePorIp({
      nombre: 'registro',
      cuantos: 1,
      porMinutos: 60,
      mensaje: 'x',
    });
    const ingreso = limitePorIp({ nombre: 'ingreso', cuantos: 5, porMinutos: 15, mensaje: 'x' });

    correr(registro, '1.1.1.1');
    expect(correr(registro, '1.1.1.1').paso).toBe(false);
    // El otro límite no se enteró de nada.
    expect(correr(ingreso, '1.1.1.1').paso).toBe(true);
  });

  it('la ventana se renueva sola cuando pasa el tiempo', () => {
    vi.useFakeTimers();
    try {
      const limitar = limitePorIp({
        nombre: 'ventana',
        cuantos: 2,
        porMinutos: 10,
        mensaje: 'x',
      });
      correr(limitar, '1.1.1.1');
      correr(limitar, '1.1.1.1');
      expect(correr(limitar, '1.1.1.1').paso).toBe(false);

      vi.advanceTimersByTime(11 * 60_000);
      expect(correr(limitar, '1.1.1.1').paso).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin IP reconocible, los anónimos comparten cupo en vez de no tener ninguno', () => {
    const limitar = tres();
    const sinIp = () => {
      const res = respuestaFalsa();
      const next = vi.fn() as unknown as NextFunction;
      limitar({ socket: {} } as unknown as Request, res, next);
      return (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    };
    for (let i = 0; i < 3; i++) expect(sinIp()).toBe(true);
    expect(sinIp()).toBe(false);
  });
});
