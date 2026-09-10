/**
 * Vista pública del saldo, sin login: se abre desde el link de WhatsApp (D-011).
 *
 * Devuelve sólo los datos del cliente que firma el token. No expone documento,
 * ni ids internos de otras entidades, ni nada de otros clientes.
 */
import { Router } from 'express';
import { prisma } from '../../infra/prisma/cliente.js';
import { verificarTokenCliente } from '../../servicios/tokenCliente.js';
import { resumenDeCuenta } from '../../servicios/saldos.js';

export function rutasPublicas() {
  const router = Router();

  router.get('/saldo/:token', async (req, res, next) => {
    try {
      const contenido = verificarTokenCliente(String(req.params.token));
      if (!contenido) {
        return res.status(404).json({ error: 'LINK_INVALIDO', mensaje: 'El link no es válido' });
      }

      const cliente = await prisma.cliente.findUnique({
        where: { id: contenido.sub },
        select: { id: true, nombre: true, tokenVersion: true, fusionadoEnId: true },
      });
      if (!cliente) {
        return res.status(404).json({ error: 'LINK_INVALIDO', mensaje: 'El link no es válido' });
      }
      // El link se puede revocar subiendo la versión del token del cliente.
      if (cliente.tokenVersion !== contenido.v) {
        return res.status(404).json({ error: 'LINK_VENCIDO', mensaje: 'El link ya no sirve' });
      }

      const resumen = await resumenDeCuenta(
        prisma,
        cliente.fusionadoEnId ?? cliente.id,
        15,
      );

      return res.json({
        nombre: resumen.cliente.nombre,
        saldoPuntos: resumen.saldoPuntos,
        equivalenteTexto: resumen.equivalenteTexto,
        faltaParaElProximoTexto: resumen.faltaParaElProximoTexto,
        topeCanjeBps: resumen.topeCanjeBps,
        temporada: resumen.temporada,
        movimientos: resumen.movimientos.map((m) => ({
          fecha: m.fecha,
          tipo: m.tipo,
          puntos: m.puntos,
          montoTexto: m.montoTexto,
          local: m.local,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
