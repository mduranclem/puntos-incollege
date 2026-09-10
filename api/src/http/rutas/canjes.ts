/**
 * Canje en el mostrador: puntos por descuento en pesos sobre el precio de lista.
 *
 * El tope y el valor del punto salen de la configuración (D-009). La regla de
 * "un solo beneficio por operación" la aplica el sistema, no el vendedor (D-008).
 * El saldo se verifica dentro de la transacción con la cuenta bloqueada (D-007).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { exigeSesion } from '../sesion.js';
import { MotorDePuntos } from '../../motor/motorPuntos.js';
import { RepositorioPrisma } from '../../infra/prisma/repositorioPrisma.js';
import { formatearPesos, parsearImporte } from '../../dominio/dinero.js';
import { puntosMaximosCanjeables } from '../../dominio/reglas.js';
import { buscarClientePorTelefono, cuentaVigente } from '../../servicios/clientes.js';
import { configuracionVigente } from '../../servicios/configuracion.js';
import { resumenDeCuenta } from '../../servicios/saldos.js';
import { BENEFICIOS_COMERCIALES, ErrorDeNegocio } from '../../dominio/tipos.js';

const motor = new MotorDePuntos(new RepositorioPrisma(prisma));

const Canje = z.object({
  telefono: z.string().min(3),
  totalVenta: z.string().min(1),
  puntos: z.number().int().positive(),
  /** El vendedor tiene que declarar qué otros beneficios aplicó (D-008). */
  beneficiosAplicados: z.array(z.enum(BENEFICIOS_COMERCIALES)).default([]),
  referencia: z.string().max(64).optional(),
  motivo: z.string().max(200).optional(),
});

export function rutasDeCanjes() {
  const router = Router();
  router.use(exigeSesion);

  /** Cuánto se puede canjear en esta venta, sin escribir nada. */
  router.get('/simular', async (req, res, next) => {
    try {
      const telefono = String(req.query.telefono ?? '');
      const totalVentaCentavos = parsearImporte(String(req.query.totalVenta ?? '0'));
      const cliente = await buscarClientePorTelefono(
        prisma,
        telefono,
        req.sesion!.codigoAreaPorDefecto,
      );
      if (!cliente) return res.json({ encontrado: false });

      const [resumen, config] = await Promise.all([
        resumenDeCuenta(prisma, cliente.id, 5),
        configuracionVigente(prisma),
      ]);
      const maximo = puntosMaximosCanjeables(
        totalVentaCentavos,
        resumen.saldoPuntos,
        config.valorPuntoCentavos,
        config.topeCanjeBps,
      );

      return res.json({
        encontrado: true,
        ...resumen,
        puntosMaximos: maximo,
        descuentoMaximoTexto: formatearPesos(BigInt(maximo) * config.valorPuntoCentavos),
        topeTexto: formatearPesos((totalVentaCentavos * BigInt(config.topeCanjeBps)) / 10_000n),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const datos = Canje.parse(req.body);
      const sesion = req.sesion!;
      const totalVentaCentavos = parsearImporte(datos.totalVenta);

      const cliente = await buscarClientePorTelefono(
        prisma,
        datos.telefono,
        sesion.codigoAreaPorDefecto,
      );
      if (!cliente) {
        throw new ErrorDeNegocio('CLIENTE_INEXISTENTE', 'Ese teléfono no tiene cuenta de puntos');
      }

      const cuenta = await cuentaVigente(prisma, cliente.id);
      const config = await configuracionVigente(prisma);

      const resultado = await motor.canjear({
        cuentaId: cuenta.id,
        puntosPedidos: datos.puntos,
        totalVentaCentavos,
        valorPuntoCentavos: config.valorPuntoCentavos,
        topeCanjeBps: config.topeCanjeBps,
        beneficiosAplicados: datos.beneficiosAplicados,
        referenciaExterna: datos.referencia ? `venta:${datos.referencia}` : null,
        motivo: datos.motivo ?? null,
        contexto: { usuarioId: sesion.usuarioId, localId: sesion.localId },
      });

      const resumen = await resumenDeCuenta(prisma, cliente.id, 5);
      const aCobrar = totalVentaCentavos - resultado.descuentoCentavos;

      return res.status(201).json({
        puntosCanjeados: -(resultado.movimiento?.puntos ?? 0),
        yaAplicado: resultado.yaAplicado,
        descuentoTexto: formatearPesos(resultado.descuentoCentavos),
        totalVentaTexto: formatearPesos(totalVentaCentavos),
        aCobrarTexto: formatearPesos(aCobrar > 0n ? aCobrar : 0n),
        ...resumen,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
