import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeSesion, firmarSesion, type Sesion } from '../sesion.js';
import type { Rol } from '../../dominio/tipos.js';

const Ingreso = z.object({
  usuario: z.string().min(1),
  pin: z.string().min(4).max(12),
});

export function rutasDeAuth() {
  const router = Router();

  router.post('/ingresar', async (req, res, next) => {
    try {
      const datos = Ingreso.parse(req.body);
      const usuario = await prisma.usuario.findUnique({
        where: { usuario: datos.usuario.trim().toLowerCase() },
        include: { local: true },
      });
      const valido = usuario?.activo && (await bcrypt.compare(datos.pin, usuario.pinHash));
      if (!usuario || !valido) {
        return res.status(401).json({ error: 'CREDENCIALES', mensaje: 'Usuario o PIN incorrecto' });
      }

      const sesion: Sesion = {
        usuarioId: usuario.id,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol as Rol,
        localId: usuario.local.id,
        localCodigo: usuario.local.codigo,
        localNombre: usuario.local.nombre,
        codigoAreaPorDefecto: usuario.local.codigoAreaPorDefecto,
      };
      return res.json({ token: firmarSesion(sesion), sesion });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/yo', exigeSesion, (req, res) => res.json({ sesion: req.sesion }));

  return router;
}
