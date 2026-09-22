import { describe, expect, it, beforeEach } from 'vitest';
import { MotorDePuntos } from '../src/motor/motorPuntos.js';
import { RepositorioEnMemoria } from '../src/infra/memoria/repositorioMemoria.js';
import { parsearImporte } from '../src/dominio/dinero.js';
import { ErrorDeNegocio } from '../src/dominio/tipos.js';
import type { Contexto } from '../src/motor/puertos.js';

/** Configuración de prueba. Son datos, no constantes del sistema (D-009). */
const CPP = parsearImporte('10000'); // $10.000 por punto
const VALOR_PUNTO = parsearImporte('1000'); // 1 punto = $1.000
const TOPE_BPS = 1000; // 10% del total de la venta

const CUENTA = 'cuenta-1';
const CONTEXTO: Contexto = { usuarioId: 'usuario-1', localId: 'local-rosario-sur' };

/** Precios reales de InCollege, para las pruebas. */
const PRECIOS = {
  remeraLisa: parsearImporte('9900'),
  remeraEstampada: parsearImporte('12650'),
  chombaBordada: parsearImporte('26950'),
  buzoFrisaBordado: parsearImporte('29700'),
  camperaCanguroBordada: parsearImporte('41800'),
};

let repo: RepositorioEnMemoria;
let motor: MotorDePuntos;

beforeEach(() => {
  repo = new RepositorioEnMemoria();
  motor = new MotorDePuntos(repo);
});

const acreditar = (referencia: string, importe: bigint) =>
  motor.acreditar({
    cuentaId: CUENTA,
    referenciaExterna: referencia,
    importeCentavos: importe,
    centavosPorPunto: CPP,
    contexto: CONTEXTO,
  });

describe('acreditación con remanente', () => {
  it('acredita puntos enteros y guarda el remanente para el próximo pago', async () => {
    const primero = await acreditar('manual:1', parsearImporte('25000'));
    expect(primero.movimiento?.puntos).toBe(2);
    expect(primero.estado.saldoPuntos).toBe(2);
    expect(primero.estado.remanenteCentavos).toBe(parsearImporte('5000'));

    // El próximo pago se calcula sobre 5.000 + 16.000 = 21.000
    const segundo = await acreditar('manual:2', parsearImporte('16000'));
    expect(segundo.movimiento?.puntos).toBe(2);
    expect(segundo.estado.saldoPuntos).toBe(4);
    expect(segundo.estado.remanenteCentavos).toBe(parsearImporte('1000'));
  });

  it('no acredita ningún punto si el pago no llega a la tasa, pero guarda el remanente', async () => {
    const r = await acreditar('manual:1', PRECIOS.remeraLisa); // $9.900
    expect(r.movimiento?.puntos).toBe(0);
    expect(r.estado.saldoPuntos).toBe(0);
    expect(r.estado.remanenteCentavos).toBe(PRECIOS.remeraLisa);
  });

  it('acumula compras chicas hasta completar un punto', async () => {
    await acreditar('manual:1', PRECIOS.remeraLisa); // 9.900
    const r = await acreditar('manual:2', PRECIOS.remeraEstampada); // + 12.650 = 22.550
    expect(r.estado.saldoPuntos).toBe(2);
    expect(r.estado.remanenteCentavos).toBe(parsearImporte('2550'));
  });

  it('trabaja con centavos exactos, sin errores de coma flotante', async () => {
    await acreditar('manual:1', parsearImporte('0,10'));
    await acreditar('manual:2', parsearImporte('0,20'));
    const estado = await repo.estadoDeCuenta(CUENTA);
    expect(estado.remanenteCentavos).toBe(30n);
  });

  it('rechaza importes no positivos', async () => {
    await expect(acreditar('manual:x', 0n)).rejects.toThrow(ErrorDeNegocio);
  });

  it('la tasa es un parámetro: con otra tasa acredita distinto', async () => {
    const r = await motor.acreditar({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      importeCentavos: parsearImporte('25000'),
      centavosPorPunto: parsearImporte('5000'), // $5.000 por punto
      contexto: CONTEXTO,
    });
    expect(r.movimiento?.puntos).toBe(5);
  });
});

describe('idempotencia: doble acreditación del mismo pago', () => {
  it('reintentar la misma referencia no acredita dos veces', async () => {
    const primero = await acreditar('manual:abc', parsearImporte('25000'));
    const reintento = await acreditar('manual:abc', parsearImporte('25000'));

    expect(reintento.yaAplicado).toBe(true);
    expect(reintento.movimiento?.id).toBe(primero.movimiento?.id);
    expect(reintento.estado.saldoPuntos).toBe(2);
    expect(repo.movimientosDe(CUENTA)).toHaveLength(1);
  });

  it('dos acreditaciones simultáneas del mismo pago dejan un solo movimiento', async () => {
    const resultados = await Promise.allSettled([
      acreditar('manual:abc', parsearImporte('25000')),
      acreditar('manual:abc', parsearImporte('25000')),
    ]);
    expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(repo.movimientosDe(CUENTA)).toHaveLength(1);
    expect((await repo.estadoDeCuenta(CUENTA)).saldoPuntos).toBe(2);
  });
});

describe('canje', () => {
  const canjear = (puntos: number, total: bigint, beneficios: never[] = []) =>
    motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: puntos,
      totalVentaCentavos: total,
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_BPS,
      beneficiosAplicados: beneficios,
      contexto: CONTEXTO,
    });

  beforeEach(async () => {
    await acreditar('manual:carga', parsearImporte('300000')); // 30 puntos
  });

  it('descuenta puntos y devuelve el descuento en pesos', async () => {
    const total = parsearImporte('100000');
    const r = await canjear(5, total);
    expect(r.movimiento?.puntos).toBe(-5);
    expect(r.descuentoCentavos).toBe(parsearImporte('5000'));
    expect(r.estado.saldoPuntos).toBe(25);
  });

  it('respeta el tope del 10% de la compra', async () => {
    // Campera $41.800 => tope $4.180 => máximo 4 puntos ($4.000)
    await expect(canjear(5, PRECIOS.camperaCanguroBordada)).rejects.toMatchObject({
      codigo: 'CANJE_SUPERA_TOPE',
    });
    const r = await canjear(4, PRECIOS.camperaCanguroBordada);
    expect(r.descuentoCentavos).toBe(parsearImporte('4000'));
  });

  it('el tope es configurable', async () => {
    const r = await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 8,
      totalVentaCentavos: PRECIOS.camperaCanguroBordada,
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: 2000, // 20%
      beneficiosAplicados: [],
      contexto: CONTEXTO,
    });
    expect(r.movimiento?.puntos).toBe(-8);
  });

  it('rechaza el canje que excede el saldo', async () => {
    await expect(canjear(31, parsearImporte('1000000'))).rejects.toMatchObject({
      codigo: 'SALDO_INSUFICIENTE',
    });
    expect((await repo.estadoDeCuenta(CUENTA)).saldoPuntos).toBe(30);
  });

  // Hasta D-042 esto se rechazaba. Ahora se permite y la decisión es del
  // mostrador; lo que el sistema garantiza es que quede registrado.
  it('se puede canjear en una venta que ya tuvo otro beneficio (D-042)', async () => {
    const resultado = await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 2,
      totalVentaCentavos: parsearImporte('100000'),
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_BPS,
      beneficiosAplicados: ['DESCUENTO_CONTADO_10'],
      contexto: CONTEXTO,
    });

    expect(resultado.movimiento?.puntos).toBe(-2);
    expect((await repo.estadoDeCuenta(CUENTA)).saldoPuntos).toBe(28);
  });

  it('el beneficio declarado queda guardado en el movimiento, para poder medirlo', async () => {
    const resultado = await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 1,
      totalVentaCentavos: parsearImporte('100000'),
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_BPS,
      beneficiosAplicados: ['BONIFICACION_PRIMERA_CUOTA_50'],
      contexto: CONTEXTO,
    });

    const metadata = resultado.movimiento?.metadata as {
      beneficiosDeclarados?: string[];
    } | null;
    expect(metadata?.beneficiosDeclarados).toEqual(['BONIFICACION_PRIMERA_CUOTA_50']);
  });

  it('el canje no toca el remanente', async () => {
    const antes = await repo.estadoDeCuenta(CUENTA);
    await canjear(3, parsearImporte('100000'));
    const despues = await repo.estadoDeCuenta(CUENTA);
    expect(despues.remanenteCentavos).toBe(antes.remanenteCentavos);
  });

  it('dos canjes simultáneos no pueden gastar el mismo saldo', async () => {
    const total = parsearImporte('300000'); // tope 30 puntos
    const resultados = await Promise.allSettled([
      canjear(20, total),
      canjear(20, total),
    ]);
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const fallados = resultados.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fallados).toHaveLength(1);
    expect((await repo.estadoDeCuenta(CUENTA)).saldoPuntos).toBe(10);
  });
});

describe('reversa de pago', () => {
  it('genera un movimiento inverso y no borra nada', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    const r = await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'Se anuló la venta',
      contexto: CONTEXTO,
    });

    expect(r.movimiento?.tipo).toBe('REVERSA');
    expect(r.movimiento?.puntos).toBe(-2);
    expect(r.estado.saldoPuntos).toBe(0);
    expect(r.estado.remanenteCentavos).toBe(0n);
    expect(repo.movimientosDe(CUENTA)).toHaveLength(2); // nada se borró
  });

  it('devuelve puntos de más si el remanente ya se consumió en pagos posteriores', async () => {
    await acreditar('manual:1', parsearImporte('25000')); // 2 pts, remanente 5.000
    await acreditar('manual:2', parsearImporte('16000')); // 2 pts, remanente 1.000

    const r = await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'Cheque rechazado',
      contexto: CONTEXTO,
    });

    // Queda sólo el pago de 16.000: 1 punto y 6.000 de remanente.
    expect(r.estado.saldoPuntos).toBe(1);
    expect(r.estado.remanenteCentavos).toBe(parsearImporte('6000'));
    expect(r.movimiento?.puntos).toBe(-3);
  });

  it('reintentar la reversa es inofensivo', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    const primera = await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'x',
      contexto: CONTEXTO,
    });
    const segunda = await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'x',
      contexto: CONTEXTO,
    });
    expect(segunda.yaAplicado).toBe(true);
    expect(segunda.movimiento?.id).toBe(primera.movimiento?.id);
    expect((await repo.estadoDeCuenta(CUENTA)).saldoPuntos).toBe(0);
  });

  it('falla si no hay acreditación con esa referencia', async () => {
    await expect(
      motor.revertir({
        cuentaId: CUENTA,
        referenciaExterna: 'manual:no-existe',
        motivo: 'x',
        contexto: CONTEXTO,
      }),
    ).rejects.toMatchObject({ codigo: 'ACREDITACION_INEXISTENTE' });
  });

  it('el saldo puede quedar negativo si ya se canjearon puntos del pago anulado', async () => {
    await acreditar('manual:1', parsearImporte('100000')); // 10 puntos
    await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 10,
      totalVentaCentavos: parsearImporte('1000000'),
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_BPS,
      beneficiosAplicados: [],
      contexto: CONTEXTO,
    });
    const r = await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'Pago anulado',
      contexto: CONTEXTO,
    });
    expect(r.estado.saldoPuntos).toBe(-10); // deuda visible, no se esconde (D-005)
  });
});

describe('vencimiento de temporada', () => {
  it('lleva el saldo y el remanente a cero con un movimiento de vencimiento', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    const r = await motor.vencer({
      cuentaId: CUENTA,
      temporadaId: 'temporada-2026',
      contexto: { usuarioId: null, localId: null },
    });

    expect(r.movimiento?.tipo).toBe('VENCIMIENTO');
    expect(r.movimiento?.puntos).toBe(-2);
    expect(r.estado.saldoPuntos).toBe(0);
    expect(r.estado.remanenteCentavos).toBe(0n);
    expect(repo.movimientosDe(CUENTA)).toHaveLength(2);
  });

  it('es idempotente por temporada', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    await motor.vencer({
      cuentaId: CUENTA,
      temporadaId: 'temporada-2026',
      contexto: { usuarioId: null, localId: null },
    });
    const segunda = await motor.vencer({
      cuentaId: CUENTA,
      temporadaId: 'temporada-2026',
      contexto: { usuarioId: null, localId: null },
    });
    expect(segunda.yaAplicado).toBe(true);
    expect(repo.movimientosDe(CUENTA)).toHaveLength(2);
  });

  it('no genera movimiento si la cuenta está vacía', async () => {
    const r = await motor.vencer({
      cuentaId: CUENTA,
      temporadaId: 'temporada-2026',
      contexto: { usuarioId: null, localId: null },
    });
    expect(r.movimiento).toBeNull();
    expect(repo.movimientosDe(CUENTA)).toHaveLength(0);
  });
});

describe('invariantes del libro mayor', () => {
  it('la caché coincide siempre con la suma de los movimientos (D-004)', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    await acreditar('manual:2', parsearImporte('16000'));
    await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 2,
      totalVentaCentavos: parsearImporte('100000'),
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_BPS,
      beneficiosAplicados: [],
      contexto: CONTEXTO,
    });
    await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:2',
      motivo: 'x',
      contexto: CONTEXTO,
    });

    const desdeMovimientos = await repo.estadoDeCuenta(CUENTA);
    const cacheada = repo.cache.get(CUENTA);
    expect(cacheada?.saldoPuntos).toBe(desdeMovimientos.saldoPuntos);
    expect(cacheada?.remanenteCentavos).toBe(desdeMovimientos.remanenteCentavos);
  });

  it('con tasa constante: total pagado = puntos emitidos × tasa + remanente (D-005)', async () => {
    const pagos = ['9900', '12650', '26950', '29700', '41800'];
    for (const [i, p] of pagos.entries()) {
      await acreditar(`manual:${i}`, parsearImporte(p));
    }
    const total = pagos.reduce((suma, p) => suma + parsearImporte(p), 0n);
    const estado = await repo.estadoDeCuenta(CUENTA);
    expect(BigInt(estado.saldoPuntos) * CPP + estado.remanenteCentavos).toBe(total);

    // El invariante también se sostiene después de anular uno de los pagos.
    await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:2',
      motivo: 'x',
      contexto: CONTEXTO,
    });
    const totalSinAnulado = total - parsearImporte('26950');
    const despues = await repo.estadoDeCuenta(CUENTA);
    expect(BigInt(despues.saldoPuntos) * CPP + despues.remanenteCentavos).toBe(totalSinAnulado);
  });

  it('ningún movimiento se modifica ni se borra', async () => {
    await acreditar('manual:1', parsearImporte('25000'));
    const copia = structuredClone(repo.movimientosDe(CUENTA));
    await motor.revertir({
      cuentaId: CUENTA,
      referenciaExterna: 'manual:1',
      motivo: 'x',
      contexto: CONTEXTO,
    });
    const actuales = repo.movimientosDe(CUENTA);
    expect(actuales.length).toBeGreaterThan(copia.length);
    expect(actuales[0]).toEqual(copia[0]);
  });
});
