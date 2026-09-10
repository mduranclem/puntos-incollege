/**
 * Lectura del saldo de un cliente. El saldo se lee del libro mayor; la caché de
 * la cuenta sólo se usa para listados masivos (D-004).
 */
import type { PrismaClient } from '@prisma/client';
import { formatearPesos } from '../dominio/dinero.js';
import { formatearTelefono } from '../dominio/telefono.js';
import { configuracionVigente } from './configuracion.js';
import { cuentaVigente } from './clientes.js';

export type ResumenDeCuenta = Awaited<ReturnType<typeof resumenDeCuenta>>;

export async function resumenDeCuenta(
  prisma: PrismaClient,
  clienteId: string,
  cantidadDeMovimientos = 10,
) {
  const [cliente, config] = await Promise.all([
    prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } }),
    configuracionVigente(prisma),
  ]);
  const cuenta = await cuentaVigente(prisma, clienteId);

  const [suma, ultimo, movimientos] = await Promise.all([
    prisma.movimiento.aggregate({ where: { cuentaId: cuenta.id }, _sum: { puntos: true } }),
    prisma.movimiento.findFirst({
      where: { cuentaId: cuenta.id },
      orderBy: { secuencia: 'desc' },
      select: { remanenteResultanteCentavos: true },
    }),
    prisma.movimiento.findMany({
      where: { cuentaId: cuenta.id },
      orderBy: { secuencia: 'desc' },
      take: cantidadDeMovimientos,
      include: { local: { select: { nombre: true } } },
    }),
  ]);

  const saldoPuntos = suma._sum.puntos ?? 0;
  const equivalenteCentavos = BigInt(saldoPuntos) * config.valorPuntoCentavos;
  const remanenteCentavos = ultimo?.remanenteResultanteCentavos ?? 0n;
  const faltaCentavos =
    (config.tasas.UNIFORMES ?? 0n) > 0n
      ? (config.tasas.UNIFORMES ?? 0n) - remanenteCentavos
      : 0n;

  return {
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      telefonoE164: cliente.telefonoE164,
      telefono: formatearTelefono(cliente.telefonoE164),
    },
    cuentaId: cuenta.id,
    saldoPuntos,
    equivalenteCentavos,
    equivalenteTexto: formatearPesos(equivalenteCentavos),
    remanenteCentavos,
    remanenteTexto: formatearPesos(remanenteCentavos),
    /** Cuánto falta pagar en efectivo para sumar el próximo punto. */
    faltaParaElProximoCentavos: faltaCentavos > 0n ? faltaCentavos : 0n,
    faltaParaElProximoTexto: formatearPesos(faltaCentavos > 0n ? faltaCentavos : 0n),
    valorPuntoCentavos: config.valorPuntoCentavos,
    topeCanjeBps: config.topeCanjeBps,
    temporada: {
      nombre: config.temporada.nombre,
      venceEn: config.temporada.cierreEn,
    },
    movimientos: movimientos.map((m) => ({
      id: m.id,
      fecha: m.creadoEn,
      tipo: m.tipo,
      puntos: m.puntos,
      montoOrigenCentavos: m.montoOrigenCentavos,
      montoTexto: m.montoOrigenCentavos ? formatearPesos(m.montoOrigenCentavos) : null,
      local: m.local?.nombre ?? null,
      motivo: m.motivo,
    })),
  };
}
