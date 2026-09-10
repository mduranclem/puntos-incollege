/**
 * Link de saldo para el cliente: token firmado, sin login (D-011).
 * Cambiar un número en la URL no muestra el saldo de otro: la firma lo impide.
 */
import jwt from 'jsonwebtoken';

const SECRETO = () => process.env.TOKEN_CLIENTE_SECRET ?? 'cambiar-en-produccion-tambien';
const DIAS = () => Number(process.env.TOKEN_CLIENTE_DIAS ?? 180);

export type ContenidoToken = { sub: string; v: number };

export function firmarTokenCliente(clienteId: string, tokenVersion: number): string {
  return jwt.sign({ sub: clienteId, v: tokenVersion }, SECRETO(), {
    expiresIn: `${DIAS()}d`,
  });
}

export function verificarTokenCliente(token: string): ContenidoToken | null {
  try {
    const contenido = jwt.verify(token, SECRETO()) as ContenidoToken;
    return contenido?.sub ? contenido : null;
  } catch {
    return null;
  }
}

export function linkDeSaldo(clienteId: string, tokenVersion: number): string {
  const base = (process.env.URL_PUBLICA_WEB ?? 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/s/${firmarTokenCliente(clienteId, tokenVersion)}`;
}
