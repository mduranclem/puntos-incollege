/**
 * Alta y baja del personal (D-026). Sólo la gerencia.
 *
 * Cada persona queda atada a un local: el local no se elige al cobrar, sale de
 * la sesión, y así cada movimiento queda firmado con el local correcto sin que
 * nadie tenga que acordarse de nada (D-012).
 *
 * Nadie puede borrar un usuario: se desactiva. Los movimientos que hizo tienen
 * que seguir apuntando a alguien (D-004).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeRol, exigeSesion } from '../sesion.js';
import { ErrorDeNegocio, ROLES } from '../../dominio/tipos.js';
import { motivoContrasenaInvalida } from '../../dominio/contrasenas.js';

/**
 * La contraseña que pone la gerencia es provisoria por definición: la sabe otro.
 * Se valida con la misma regla que la propia y el usuario queda obligado a
 * cambiarla al entrar (D-034).
 */
function exigirContrasenaValida(contrasena: string, usuario: string): void {
  const motivo = motivoContrasenaInvalida(contrasena, { usuario });
  if (motivo) throw new ErrorDeNegocio('CONTRASENA_DEBIL', motivo);
}

const Alta = z.object({
  usuario: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9.-]+$/i, 'El usuario puede tener letras, números, puntos y guiones'),
  nombre: z.string().trim().min(2).max(80),
  contrasena: z.string().min(1).max(200),
  rol: z.enum(ROLES),
  localId: z.string().uuid(),
});

const Cambio = z.object({
  nombre: z.string().trim().min(2).max(80).optional(),
  rol: z.enum(ROLES).optional(),
  localId: z.string().uuid().optional(),
  activo: z.boolean().optional(),
  contrasena: z.string().min(1).max(200).optional(),
});

export function rutasDePersonal() {
  const router = Router();
  router.use(exigeSesion, exigeRol('GERENTE'));

  router.get('/', async (_req, res, next) => {
    try {
      const personal = await prisma.usuario.findMany({
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        include: { local: { select: { id: true, nombre: true } } },
      });
      return res.json({
        personal: personal.map((u) => ({
          id: u.id,
          usuario: u.usuario,
          nombre: u.nombre,
          rol: u.rol,
          activo: u.activo,
          debeCambiarContrasena: u.debeCambiarContrasena,
          local: u.local,
          creadoEn: u.creadoEn,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const datos = Alta.parse(req.body);
      const usuario = datos.usuario.toLowerCase();

      if (await prisma.usuario.findUnique({ where: { usuario } })) {
        throw new ErrorDeNegocio('USUARIO_REPETIDO', `Ya hay alguien con el usuario "${usuario}"`);
      }
      if (!(await prisma.local.findUnique({ where: { id: datos.localId } }))) {
        throw new ErrorDeNegocio('LOCAL_INEXISTENTE', 'Ese local no existe');
      }

      exigirContrasenaValida(datos.contrasena, usuario);

      const creado = await prisma.usuario.create({
        data: {
          usuario,
          nombre: datos.nombre,
          contrasenaHash: await bcrypt.hash(datos.contrasena, 10),
          debeCambiarContrasena: true,
          rol: datos.rol,
          localId: datos.localId,
        },
        include: { local: { select: { id: true, nombre: true } } },
      });

      return res.status(201).json({
        id: creado.id,
        usuario: creado.usuario,
        nombre: creado.nombre,
        rol: creado.rol,
        activo: creado.activo,
        local: creado.local,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const datos = Cambio.parse(req.body);
      const id = String(req.params.id);
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id } });

      // No dejar a la empresa sin ningún gerente activo por un descuido.
      const dejaDeSerGerente =
        usuario.rol === 'GERENTE' && (datos.rol === 'VENDEDOR' || datos.activo === false);
      if (dejaDeSerGerente) {
        const gerentes = await prisma.usuario.count({
          where: { rol: 'GERENTE', activo: true, id: { not: id } },
        });
        if (gerentes === 0) {
          throw new ErrorDeNegocio(
            'ULTIMO_GERENTE',
            'Tiene que quedar al menos un gerente activo. Creá otro antes de cambiar este.',
          );
        }
      }

      if (datos.contrasena) exigirContrasenaValida(datos.contrasena, usuario.usuario);

      const actualizado = await prisma.usuario.update({
        where: { id },
        data: {
          ...(datos.nombre ? { nombre: datos.nombre } : {}),
          ...(datos.rol ? { rol: datos.rol } : {}),
          ...(datos.localId ? { localId: datos.localId } : {}),
          ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
          ...(datos.contrasena
            ? {
                contrasenaHash: await bcrypt.hash(datos.contrasena, 10),
                // La puso la gerencia: la persona la cambia al entrar.
                debeCambiarContrasena: true,
              }
            : {}),
        },
        include: { local: { select: { id: true, nombre: true } } },
      });

      return res.json({
        id: actualizado.id,
        usuario: actualizado.usuario,
        nombre: actualizado.nombre,
        rol: actualizado.rol,
        activo: actualizado.activo,
        local: actualizado.local,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
