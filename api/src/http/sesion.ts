/**
 * Sesión del personal: usuario + contraseña, JWT de 12 horas con el local
 * adentro (D-012). Toda operación queda firmada por usuario, local y fecha.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../infra/prisma/cliente.js';
import type { Rol } from '../dominio/tipos.js';
import { secretoObligatorio } from '../dominio/secretos.js';

export type Sesion = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  /** La contraseña la puso otro: no puede operar hasta cambiarla (D-034). */
  debeCambiarContrasena: boolean;
  /** Se compara contra la base en cada pedido: así la baja corta ya (D-044). */
  sesionVersion: number;
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

const SECRETO = () => secretoObligatorio('JWT_SECRET');

export function firmarSesion(sesion: Sesion): string {
  return jwt.sign(sesion, SECRETO(), { expiresIn: '12h', algorithm: 'HS256' });
}

/**
 * Verifica la sesión contra la base, no sólo contra la firma (D-044).
 *
 * Antes alcanzaba con que el JWT estuviera bien firmado, así que dar de baja a
 * alguien no lo sacaba: seguía cobrando hasta que el token venciera, doce horas
 * después. Lo mismo con bajarle el rol, o con cambiar una contraseña que se
 * filtró — el token robado seguía sirviendo.
 *
 * Ahora cada pedido pregunta si la persona sigue activa y si su
 * `sesionVersion` es la del token. Es una consulta por clave primaria; la API
 * ya hace varias por pedido.
 */
export async function exigeSesion(req: Request, res: Response, next: NextFunction) {
  const cabecera = req.header('authorization') ?? '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'SIN_SESION', mensaje: 'Iniciá sesión' });

  let contenido: Sesion;
  try {
    // Algoritmo fijo: no se acepta nada que no sea lo que firmamos.
    contenido = jwt.verify(token, SECRETO(), { algorithms: ['HS256'] }) as Sesion;
  } catch {
    return res.status(401).json({ error: 'SESION_VENCIDA', mensaje: 'La sesión venció' });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: contenido.usuarioId },
      select: { activo: true, sesionVersion: true },
    });

    if (!usuario?.activo) {
      return res.status(401).json({
        error: 'SESION_REVOCADA',
        mensaje: 'Tu usuario ya no está activo. Hablá con la gerencia.',
      });
    }
    if (usuario.sesionVersion !== contenido.sesionVersion) {
      return res.status(401).json({
        error: 'SESION_REVOCADA',
        mensaje: 'Tu sesión se cerró porque cambiaron tus datos. Entrá de nuevo.',
      });
    }

    req.sesion = contenido;
    return next();
  } catch (error) {
    return next(error);
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
