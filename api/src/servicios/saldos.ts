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

/**
 * Cuánta plata se ahorró esta cuenta en toda su historia, por descuentos de
 * puntos efectivamente aplicados (D-048).
 *
 * Tres cosas que la hacen menos obvia de lo que parece:
 *
 *  - **Sale del libro mayor, no de una cuenta aparte.** Un canje es un
 *    `Movimiento` de tipo CANJE con los puntos en negativo, y guarda
 *    `valorPuntoAplicadoCentavos`: cuánto valía el punto *ese día* (D-009). El
 *    ahorro se calcula con ese valor congelado y no con el de hoy. Si mañana el
 *    punto pasa a valer $1.500, lo que alguien ahorró el año pasado no cambia:
 *    no lo ahorró.
 *
 *  - **Se suma en la base y no en el navegador.** La app recibe los últimos 50
 *    movimientos, así que sumar del lado del cliente daría un número que va
 *    achicándose a medida que la persona compra más, que es exactamente al
 *    revés de lo que tiene que pasar.
 *
 *  - **Las anulaciones se restan una sola vez.** Hoy `revertir` sólo revierte
 *    acreditaciones: un canje no se puede anular, así que este segundo término
 *    nunca suma nada. Está igual porque el día que se pueda, esto ya está bien:
 *    resta los puntos que la REVERSA devolvió, al valor del canje que revierte,
 *    y eso cubre también una devolución parcial. No hay riesgo de restar dos
 *    veces porque no existe un estado "anulado" además del movimiento: la
 *    anulación *es* una fila, y `movimientoRevertidoId` es único.
 */
async function ahorroAcumulado(prisma: PrismaClient, cuentaId: string): Promise<bigint | null> {
  try {
    const filas = await prisma.$queryRaw<{ ahorro: bigint | null }[]>`
      SELECT COALESCE(SUM(
        CASE
          WHEN m.tipo::text = 'CANJE'
            THEN (-m.puntos)::bigint * COALESCE(m."valorPuntoAplicadoCentavos", 0)
          WHEN m.tipo::text = 'REVERSA' AND o.tipo::text = 'CANJE'
            THEN (-m.puntos)::bigint * COALESCE(o."valorPuntoAplicadoCentavos", 0)
          ELSE 0
        END
      ), 0)::bigint AS ahorro
      FROM "Movimiento" m
      LEFT JOIN "Movimiento" o ON o.id = m."movimientoRevertidoId"
      WHERE m."cuentaId" = ${cuentaId}
    `;
    const total = BigInt(filas[0]?.ahorro ?? 0);
    return total > 0n ? total : 0n;
  } catch {
    // Que no se pueda calcular el ahorro no es motivo para dejar a alguien sin
    // ver sus movimientos. Devuelve null y la pantalla no muestra el resumen,
    // que es distinto de mostrar cero.
    return null;
  }
}

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

  const [suma, ultimo, movimientos, ahorroCentavos] = await Promise.all([
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
    ahorroAcumulado(prisma, cuenta.id),
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
    /**
     * Cuánto hay que pagar en efectivo por cada punto. Sale de la configuración,
     * nunca del código (D-009): las pantallas lo muestran tal cual y si mañana
     * deja de ser $10.000, cambia solo.
     */
    porPuntoCentavos: config.tasas.UNIFORMES ?? 0n,
    porPuntoTexto: formatearPesos(config.tasas.UNIFORMES ?? 0n),
    valorPuntoCentavos: config.valorPuntoCentavos,
    /**
     * Ahorro histórico por descuentos ya usados. `null` quiere decir "no se
     * pudo calcular", que no es lo mismo que cero y la pantalla los trata
     * distinto.
     */
    ahorroCentavos,
    ahorroTexto: ahorroCentavos === null ? null : formatearPesos(ahorroCentavos),
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
