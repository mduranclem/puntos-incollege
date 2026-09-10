/**
 * Tests de integración contra PostgreSQL de verdad: las garantías que sólo puede
 * dar el motor de base (unicidad real y `SELECT ... FOR UPDATE` real).
 *
 * Se saltean solos si no hay `DATABASE_URL_TEST` (D-015). Para correrlos:
 *   DATABASE_URL_TEST=postgresql://... npx prisma migrate deploy && npx vitest run
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { MotorDePuntos } from '../src/motor/motorPuntos.js';
import { RepositorioPrisma } from '../src/infra/prisma/repositorioPrisma.js';
import { parsearImporte } from '../src/dominio/dinero.js';

const URL = process.env.DATABASE_URL_TEST;
const hayBase = Boolean(URL);

describe.skipIf(!hayBase)('libro mayor contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let motor: MotorDePuntos;
  let cuentaId: string;
  const CPP = parsearImporte('10000');
  const contexto = { usuarioId: null, localId: null };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL! } } });
    motor = new MotorDePuntos(new RepositorioPrisma(prisma));

    const local = await prisma.local.upsert({
      where: { codigo: 'TEST' },
      update: {},
      create: { codigo: 'TEST', nombre: 'Local de prueba', codigoAreaPorDefecto: '341' },
    });
    const temporada = await prisma.temporada.upsert({
      where: { nombre: 'Temporada de prueba' },
      update: {},
      create: {
        nombre: 'Temporada de prueba',
        inicioEn: new Date('2000-01-01'),
        cierreEn: new Date('2999-12-31'),
      },
    });
    const cliente = await prisma.cliente.create({
      data: {
        telefonoE164: `+549341${Date.now().toString().slice(-7)}`,
        telefonoCrudo: 'test',
        nombre: 'Cuenta de prueba',
        localOrigenId: local.id,
      },
    });
    const cuenta = await prisma.cuentaPuntos.create({
      data: { clienteId: cliente.id, temporadaId: temporada.id },
    });
    cuentaId = cuenta.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('la restricción única impide acreditar dos veces el mismo pago', async () => {
    const referencia = `manual:test-${Date.now()}`;
    const acreditar = () =>
      motor.acreditar({
        cuentaId,
        referenciaExterna: referencia,
        importeCentavos: parsearImporte('25000'),
        centavosPorPunto: CPP,
        contexto,
      });

    await acreditar();
    const reintento = await acreditar();
    expect(reintento.yaAplicado).toBe(true);

    const cuantos = await prisma.movimiento.count({
      where: { tipo: 'ACREDITACION', referenciaExterna: referencia },
    });
    expect(cuantos).toBe(1);
  });

  it('dos canjes concurrentes no pueden gastar el mismo saldo', async () => {
    await motor.acreditar({
      cuentaId,
      referenciaExterna: `manual:carga-${Date.now()}`,
      importeCentavos: parsearImporte('300000'), // 30 puntos
      centavosPorPunto: CPP,
      contexto,
    });
    const saldoAntes = (await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } }))
      .saldoCacheado;

    const canje = (puntos: number) =>
      motor.canjear({
        cuentaId,
        puntosPedidos: puntos,
        totalVentaCentavos: parsearImporte('10000000'),
        valorPuntoCentavos: parsearImporte('1000'),
        topeCanjeBps: 1000,
        beneficiosAplicados: [],
        contexto,
      });

    const mitad = Math.floor(saldoAntes / 2) + 1;
    const resultados = await Promise.allSettled([canje(mitad), canje(mitad)]);
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(1);

    const cuenta = await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(cuenta.saldoCacheado).toBe(saldoAntes - mitad);
    expect(cuenta.saldoCacheado).toBeGreaterThanOrEqual(0);
  });

  it('la caché coincide con la suma de los movimientos', async () => {
    const suma = await prisma.movimiento.aggregate({
      where: { cuentaId },
      _sum: { puntos: true },
    });
    const cuenta = await prisma.cuentaPuntos.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(cuenta.saldoCacheado).toBe(suma._sum.puntos ?? 0);
  });
});
