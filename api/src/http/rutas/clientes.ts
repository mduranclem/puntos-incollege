import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeRol, exigeSesion } from '../sesion.js';
import {
  buscarClientePorTelefono,
  buscarCoincidencias,
  buscarDuplicados,
  fusionarClientes,
  resolverCliente,
} from '../../servicios/clientes.js';
import { resumenDeCuenta } from '../../servicios/saldos.js';
import { linkDeSaldo } from '../../servicios/tokenCliente.js';
import { normalizarTelefono } from '../../dominio/telefono.js';

const Alta = z.object({
  telefono: z.string().min(3),
  nombre: z.string().trim().min(1).max(120).optional(),
  documento: z.string().trim().max(20).optional(),
});

export function rutasDeClientes() {
  const router = Router();
  router.use(exigeSesion);

  /** Búsqueda por teléfono: es lo primero que hace el vendedor en el mostrador. */
  router.get('/buscar', async (req, res, next) => {
    try {
      const telefono = String(req.query.telefono ?? '');
      const area = req.sesion!.codigoAreaPorDefecto;
      const telefonoE164 = normalizarTelefono(telefono, { areaPorDefecto: area });
      const cliente = await buscarClientePorTelefono(prisma, telefono, area);
      if (!cliente) {
        return res.json({ encontrado: false, telefonoE164 });
      }
      const resumen = await resumenDeCuenta(prisma, cliente.id, 5);
      return res.json({ encontrado: true, telefonoE164, ...resumen });
    } catch (error) {
      return next(error);
    }
  });

  /**
   * Búsqueda rápida: últimos dígitos del teléfono o nombre (D-023). Devuelve una
   * lista corta para elegir, sin el resumen completo de cada cuenta.
   */
  router.get('/sugerencias', async (req, res, next) => {
    try {
      const coincidencias = await buscarCoincidencias(prisma, String(req.query.q ?? ''));
      return res.json({ coincidencias });
    } catch (error) {
      return next(error);
    }
  });

  /** Alta desde el mostrador. Idempotente: si el teléfono ya existe, lo devuelve. */
  router.post('/', async (req, res, next) => {
    try {
      const datos = Alta.parse(req.body);
      const cliente = await resolverCliente(prisma, {
        telefonoCrudo: datos.telefono,
        nombre: datos.nombre,
        documento: datos.documento,
        localId: req.sesion!.localId,
        areaPorDefecto: req.sesion!.codigoAreaPorDefecto,
      });
      const resumen = await resumenDeCuenta(prisma, cliente.id, 5);
      return res.status(cliente.creado ? 201 : 200).json({ creado: cliente.creado, ...resumen });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const resumen = await resumenDeCuenta(prisma, String(req.params.id), 20);
      return res.json(resumen);
    } catch (error) {
      return next(error);
    }
  });

  /** Link firmado para mandar por WhatsApp (D-011). */
  router.get('/:id/link', async (req, res, next) => {
    try {
      const cliente = await prisma.cliente.findUniqueOrThrow({
        where: { id: String(req.params.id) },
        select: { id: true, tokenVersion: true },
      });
      return res.json({ link: linkDeSaldo(cliente.id, cliente.tokenVersion) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/duplicados/lista', exigeRol('ADMINISTRADOR'), async (_req, res, next) => {
    try {
      return res.json({ grupos: await buscarDuplicados(prisma) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/fusionar', exigeRol('ADMINISTRADOR'), async (req, res, next) => {
    try {
      const datos = z
        .object({ sobrevivienteId: z.string().uuid(), absorbidoId: z.string().uuid() })
        .parse(req.body);
      const resultado = await fusionarClientes(
        prisma,
        datos.sobrevivienteId,
        datos.absorbidoId,
        req.sesion!.usuarioId,
      );
      const resumen = await resumenDeCuenta(prisma, datos.sobrevivienteId, 20);
      return res.json({ ...resultado, resumen });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
