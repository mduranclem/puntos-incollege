/**
 * Ingreso del personal: usuario + contraseña (D-034).
 *
 * Tres cosas que no son obvias:
 *  - la respuesta de credenciales mal no distingue entre "ese usuario no existe"
 *    y "la contraseña está mal": el que prueba no aprende nada;
 *  - los intentos tienen una espera que crece, con techo (`intentosDeIngreso`);
 *  - si la contraseña la puso otro (alta, reseteo de la gerencia o seed), la
 *    sesión sale marcada y la pantalla no deja hacer nada hasta cambiarla.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeSesion, firmarSesion, type Sesion } from '../sesion.js';
import { motivoContrasenaInvalida } from '../../dominio/contrasenas.js';
import {
  esperaPendiente,
  registrarExito,
  registrarFallo,
} from '../../servicios/intentosDeIngreso.js';
import { ErrorDeNegocio, type Rol } from '../../dominio/tipos.js';

const Ingreso = z.object({
  usuario: z.string().min(1),
  contrasena: z.string().min(1).max(200),
});

const CambioPropio = z.object({
  contrasenaActual: z.string().min(1).max(200),
  contrasenaNueva: z.string().min(1).max(200),
});

function armarSesion(usuario: {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
  debeCambiarContrasena: boolean;
  local: { id: string; codigo: string; nombre: string; codigoAreaPorDefecto: string };
}): Sesion {
  return {
    usuarioId: usuario.id,
    usuario: usuario.usuario,
    nombre: usuario.nombre,
    rol: usuario.rol as Rol,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
    localId: usuario.local.id,
    localCodigo: usuario.local.codigo,
    localNombre: usuario.local.nombre,
    codigoAreaPorDefecto: usuario.local.codigoAreaPorDefecto,
  };
}

export function rutasDeAuth() {
  const router = Router();

  router.post('/ingresar', async (req, res, next) => {
    try {
      const datos = Ingreso.parse(req.body);
      const nombreDeUsuario = datos.usuario.trim().toLowerCase();

      const espera = esperaPendiente(nombreDeUsuario);
      if (espera > 0) {
        return res.status(429).json({
          error: 'DEMASIADOS_INTENTOS',
          mensaje: `Muchos intentos seguidos. Probá de nuevo en ${espera} segundos.`,
          detalle: { esperaSegundos: espera },
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { usuario: nombreDeUsuario },
        include: { local: true },
      });
      // Se compara siempre, exista o no el usuario: si no, el tiempo de
      // respuesta delata cuáles existen.
      const hash = usuario?.contrasenaHash ?? '$2a$10$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinva';
      const coincide = await bcrypt.compare(datos.contrasena, hash);
      const valido = Boolean(usuario?.activo) && coincide;

      if (!usuario || !valido) {
        const esperaNueva = registrarFallo(nombreDeUsuario);
        return res.status(401).json({
          error: 'CREDENCIALES',
          mensaje: 'Usuario o contraseña incorrectos',
          ...(esperaNueva > 0 ? { detalle: { esperaSegundos: esperaNueva } } : {}),
        });
      }

      registrarExito(nombreDeUsuario);
      const sesion = armarSesion(usuario);
      return res.json({ token: firmarSesion(sesion), sesion });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Cambio de la propia contraseña. Cualquiera puede cambiar la suya: sin esto,
   * el que entra con una contraseña que le puso otro depende de la gerencia
   * para tener una propia, y termina no cambiándola nunca.
   */
  router.post('/contrasena', exigeSesion, async (req, res, next) => {
    try {
      const datos = CambioPropio.parse(req.body);
      const sesion = req.sesion!;

      const usuario = await prisma.usuario.findUniqueOrThrow({
        where: { id: sesion.usuarioId },
        include: { local: true },
      });

      if (!(await bcrypt.compare(datos.contrasenaActual, usuario.contrasenaHash))) {
        throw new ErrorDeNegocio('CONTRASENA_ACTUAL', 'La contraseña actual no es correcta');
      }
      if (await bcrypt.compare(datos.contrasenaNueva, usuario.contrasenaHash)) {
        throw new ErrorDeNegocio(
          'CONTRASENA_REPETIDA',
          'La contraseña nueva tiene que ser distinta de la actual',
        );
      }

      const motivo = motivoContrasenaInvalida(datos.contrasenaNueva, {
        usuario: usuario.usuario,
      });
      if (motivo) throw new ErrorDeNegocio('CONTRASENA_DEBIL', motivo);

      const actualizado = await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          contrasenaHash: await bcrypt.hash(datos.contrasenaNueva, 10),
          debeCambiarContrasena: false,
          contrasenaCambiadaEn: new Date(),
        },
        include: { local: true },
      });

      // Token nuevo: el viejo lleva adentro `debeCambiarContrasena: true`.
      const nueva = armarSesion(actualizado);
      return res.json({ cambiada: true, token: firmarSesion(nueva), sesion: nueva });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/yo', exigeSesion, (req, res) => res.json({ sesion: req.sesion }));

  return router;
}
