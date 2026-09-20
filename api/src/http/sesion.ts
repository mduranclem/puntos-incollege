/**
 * Sesión del personal: usuario + contraseña, JWT de 12 horas con el local
 * adentro (D-012). Toda operación queda firmada por usuario, local y fecha.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Rol } from '../dominio/tipos.js';

export type Sesion = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  /** La contraseña la puso otro: no puede operar hasta cambiarla (D-034). */
  debeCambiarContrasena: boolean;
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

/**
 * Cierra el sistema mientras la contraseña la sepa alguien más.
 *
 * No alcanza con que la pantalla lleve al cambio: si el servidor dejara operar,
 * cualquiera con la contraseña que puso la gerencia podría cobrar llamando a la
 * API directamente, y el movimiento quedaría firmado con el nombre de otro.
 */
export function exigeContrasenaPropia(req: Request, res: Response, next: NextFunction) {
  if (req.sesion?.debeCambiarContrasena) {
    return res.status(403).json({
      error: 'CAMBIO_PENDIENTE',
      mensaje: 'Antes de seguir tenés que poner una contraseña propia.',
    });
  }
  return next();
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
