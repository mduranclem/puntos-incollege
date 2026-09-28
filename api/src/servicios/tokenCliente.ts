/**
 * Token del cliente: entra a su cuenta sin login (D-011).
 * Cambiar un número en la URL no muestra el saldo de otro: la firma lo impide.
 *
 * Hay **dos vidas distintas** a propósito (D-045):
 *
 *  - La **sesión** de la app dura 30 días. La guarda el navegador de la persona
 *    y no sale de ahí.
 *  - El **link que va por WhatsApp** dura 7. Ese sí sale: viaja por la red de
 *    Meta, pasa por n8n y queda guardado en su historial de ejecuciones, que es
 *    un sistema que comparte servidor con otras cosas y tiene sus propios
 *    usuarios. Lo que se guarda en un lugar que no controlamos tiene que durar
 *    lo menos posible.
 *
 * Siete días alcanzan de sobra: el aviso se mira el día que llega, o no se mira.
 * Y si vence, la persona entra con su mail y contraseña (D-036), que es lo que
 * va a hacer de ahí en adelante igual.
 */
import jwt from 'jsonwebtoken';
import { secretoObligatorio } from '../dominio/secretos.js';

const SECRETO = () => secretoObligatorio('TOKEN_CLIENTE_SECRET');

/** La sesión que guarda la app en el celular. */
const DIAS_SESION = () => Number(process.env.TOKEN_CLIENTE_DIAS ?? 30);

/** El link que se manda por WhatsApp. Sale de nuestro dominio: dura menos. */
const DIAS_AVISO = 7;

export type ContenidoToken = { sub: string; v: number };

export function firmarTokenCliente(
  clienteId: string,
  tokenVersion: number,
  dias = DIAS_SESION(),
): string {
  return jwt.sign({ sub: clienteId, v: tokenVersion }, SECRETO(), {
    expiresIn: `${dias}d`,
    algorithm: 'HS256',
  });
}

export function verificarTokenCliente(token: string): ContenidoToken | null {
  try {
    const contenido = jwt.verify(token, SECRETO(), { algorithms: ['HS256'] }) as ContenidoToken;
    return contenido?.sub ? contenido : null;
  } catch {
    return null;
  }
}

/**
 * El link que se manda por WhatsApp.
 *
 * La forma no cambia —`/s/<token>`— así que el workflow de n8n sigue armando el
 * mensaje igual y no hay que tocarlo. Lo que cambia es cuánto vale lo que queda
 * escrito en su historial.
 */
export function linkDeSaldo(clienteId: string, tokenVersion: number): string {
  const base = (process.env.URL_PUBLICA_WEB ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/s/${firmarTokenCliente(clienteId, tokenVersion, DIAS_AVISO)}`;
}
