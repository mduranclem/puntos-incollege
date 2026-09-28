/**
 * Link de saldo para el cliente: token firmado, sin login (D-011).
 * Cambiar un número en la URL no muestra el saldo de otro: la firma lo impide.
 */
import jwt from 'jsonwebtoken';
import { secretoObligatorio } from '../dominio/secretos.js';

const SECRETO = () => secretoObligatorio('TOKEN_CLIENTE_SECRET');
/**
 * Cuánto dura la sesión del cliente. Bajado de 180 a 30 días (D-044): el token
 * viaja por WhatsApp, queda en el historial de n8n y va en la URL del link de
 * saldo, así que cuanto más corta sea la ventana, mejor. Con mail y contraseña
 * (D-036) volver a entrar es un trámite, no una barrera.
 */
const DIAS = () => Number(process.env.TOKEN_CLIENTE_DIAS ?? 30);

export type ContenidoToken = { sub: string; v: number };

export function firmarTokenCliente(clienteId: string, tokenVersion: number): string {
  return jwt.sign({ sub: clienteId, v: tokenVersion }, SECRETO(), {
    expiresIn: `${DIAS()}d`,
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

export function linkDeSaldo(clienteId: string, tokenVersion: number): string {
  const base = (process.env.URL_PUBLICA_WEB ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/s/${firmarTokenCliente(clienteId, tokenVersion)}`;
}
