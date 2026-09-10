/**
 * Vencimiento de temporada (D-013) y aviso previo.
 *
 * El vencimiento genera un movimiento por cuenta; el saldo no se borra ni se
 * edita (D-004). Es idempotente: correr la tarea dos veces no vence dos veces.
 */
import type { PrismaClient } from '@prisma/client';
import { MotorDePuntos } from '../motor/motorPuntos.js';
import { RepositorioPrisma } from '../infra/prisma/repositorioPrisma.js';
import { configuracionVigente } from './configuracion.js';
import { encolarEvento } from './avisos.js';
import { linkDeSaldo } from './tokenCliente.js';
import { formatearPesos } from '../dominio/dinero.js';

const DIA = 24 * 60 * 60 * 1000;

/** Aviso a quienes tienen saldo, N días antes del cierre. Uno solo por temporada. */
export async function avisarProximosVencimientos(
  prisma: PrismaClient,
  ahora = new Date(),
): Promise<{ avisados: number }> {
  const config = await configuracionVigente(prisma, ahora);
  const faltan = (config.temporada.cierreEn.getTime() - ahora.getTime()) / DIA;
  if (faltan < 0 || faltan > config.diasAvisoVencimiento) return { avisados: 0 };

  const cuentas = await prisma.cuentaPuntos.findMany({
    where: { temporadaId: config.temporada.id, saldoCacheado: { gt: 0 } },
    include: { cliente: true },
  });

  for (const cuenta of cuentas) {
    await encolarEvento(
      prisma,
      'puntos.por_vencer',
      {
        telefono: cuenta.cliente.telefonoE164,
        nombre: cuenta.cliente.nombre,
        saldoPuntos: cuenta.saldoCacheado,
        equivalenteTexto: formatearPesos(
          BigInt(cuenta.saldoCacheado) * config.valorPuntoCentavos,
        ),
        venceEn: config.temporada.cierreEn.toISOString(),
        diasQueFaltan: Math.ceil(faltan),
        link: linkDeSaldo(cuenta.cliente.id, cuenta.cliente.tokenVersion),
      },
      `porvencer:${config.temporada.id}:${cuenta.id}`,
    );
  }

  return { avisados: cuentas.length };
}

/**
 * Vence las temporadas cuya fecha de cierre ya pasó y abre la siguiente, para que
 * el mostrador siga funcionando al día siguiente sin intervención.
 */
export async function vencerTemporadasCerradas(
  prisma: PrismaClient,
  ahora = new Date(),
): Promise<{ temporadas: number; cuentasVencidas: number }> {
  const motor = new MotorDePuntos(new RepositorioPrisma(prisma));
  const aVencer = await prisma.temporada.findMany({
    where: { cerrada: false, cierreEn: { lte: ahora } },
  });

  let cuentasVencidas = 0;

  for (const temporada of aVencer) {
    const cuentas = await prisma.cuentaPuntos.findMany({
      where: {
        temporadaId: temporada.id,
        OR: [{ saldoCacheado: { not: 0 } }, { remanenteCentavos: { not: 0n } }],
      },
      include: { cliente: true },
    });

    for (const cuenta of cuentas) {
      const resultado = await motor.vencer({
        cuentaId: cuenta.id,
        temporadaId: temporada.id,
        contexto: { usuarioId: null, localId: null, ocurridoEn: ahora },
      });
      if (resultado.movimiento && !resultado.yaAplicado) {
        cuentasVencidas++;
        const vencidos = -resultado.movimiento.puntos;
        if (vencidos > 0) {
          await encolarEvento(
            prisma,
            'puntos.vencidos',
            {
              telefono: cuenta.cliente.telefonoE164,
              nombre: cuenta.cliente.nombre,
              puntosVencidos: vencidos,
              temporada: temporada.nombre,
            },
            `vencidos:${temporada.id}:${cuenta.id}`,
          );
        }
      }
    }

    await prisma.temporada.update({
      where: { id: temporada.id },
      data: { cerrada: true },
    });

    // Abrir la temporada siguiente si no hay ninguna abierta.
    const abierta = await prisma.temporada.findFirst({ where: { cerrada: false } });
    if (!abierta) {
      const inicio = new Date(temporada.cierreEn.getTime() + 1000);
      const anio = inicio.getUTCFullYear();
      const nombre = `Temporada ${anio}`;
      const nueva = await prisma.temporada.upsert({
        where: { nombre },
        update: {},
        create: {
          nombre,
          inicioEn: inicio,
          cierreEn: new Date(Date.UTC(anio, 11, 31, 23, 59, 59)),
        },
      });
      // La configuración vigente pasa a apuntar a la temporada nueva.
      const config = await prisma.configuracion.findFirst({
        orderBy: { vigenteDesde: 'desc' },
        include: { tasas: true },
      });
      if (config) {
        await prisma.configuracion.create({
          data: {
            vigenteDesde: inicio,
            valorPuntoCentavos: config.valorPuntoCentavos,
            topeCanjeBps: config.topeCanjeBps,
            diasAvisoVencimiento: config.diasAvisoVencimiento,
            temporadaId: nueva.id,
            tasas: {
              create: config.tasas.map((t) => ({
                lineaDeNegocio: t.lineaDeNegocio,
                centavosPorPunto: t.centavosPorPunto,
              })),
            },
          },
        });
      }
    }
  }

  return { temporadas: aVencer.length, cuentasVencidas };
}
