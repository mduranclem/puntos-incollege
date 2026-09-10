/**
 * Sesión del personal: usuario + PIN, JWT de 12 horas con el local adentro (D-012).
 * Toda operación queda firmada por usuario, local y fecha.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Rol } from '../dominio/tipos.js';

export type Sesion = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  localId: string;
  localCodigo: string;
  localNombre: string;
  codigoAreaPorDefecto: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

const SECRETO = () => process.env.JWT_SECRET ?? 'cambiar-en-produccion';

export function firmarSesion(sesion: Sesion): string {
  return jwt.sign(sesion, SECRETO(), { expiresIn: '12h' });
}

export function exigeSesion(req: Request, res: Response, next: NextFunction) {
  const cabecera = req.header('authorization') ?? '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'SIN_SESION', mensaje: 'Iniciá sesión' });
  try {
    req.sesion = jwt.verify(token, SECRETO()) as Sesion;
    return next();
  } catch {
    return res.status(401).json({ error: 'SESION_VENCIDA', mensaje: 'La sesión venció' });
  }
}

export function exigeRol(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.sesion) return res.status(401).json({ error: 'SIN_SESION' });
    if (!roles.includes(req.sesion.rol)) {
      return res.status(403).json({ error: 'SIN_PERMISO', mensaje: 'No tenés permiso para esto' });
    }
    return next();
  };
}
