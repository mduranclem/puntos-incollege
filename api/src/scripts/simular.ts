/**
 * Simulación del ciclo completo del motor de puntos, por consola y sin base de
 * datos: acreditar (con remanente), canjear (con tope), anular un pago y vencer
 * la temporada.
 *
 *   npm run simular
 */
import { MotorDePuntos } from '../motor/motorPuntos.js';
import { RepositorioEnMemoria } from '../infra/memoria/repositorioMemoria.js';
import { formatearPesos, parsearImporte } from '../dominio/dinero.js';
import { normalizarTelefono, formatearTelefono } from '../dominio/telefono.js';
import type { Contexto } from '../motor/puertos.js';

// Configuración de la corrida. En el sistema real sale de la base (D-009).
const CENTAVOS_POR_PUNTO = parsearImporte('10000'); // $10.000 = 1 punto
const VALOR_PUNTO = parsearImporte('1000'); // 1 punto = $1.000
const TOPE_CANJE_BPS = 1000; // 10% de la venta

const repo = new RepositorioEnMemoria();
const motor = new MotorDePuntos(repo);
const CUENTA = 'cuenta-simulada';
const CONTEXTO: Contexto = { usuarioId: 'vendedora-mostrador', localId: 'rosario-sur' };

const titulo = (texto: string) => console.log(`\n\x1b[1m${texto}\x1b[0m`);
const linea = (texto: string) => console.log(`  ${texto}`);

async function estado() {
  const e = await repo.estadoDeCuenta(CUENTA);
  return `saldo ${e.saldoPuntos} punto(s) · remanente ${formatearPesos(e.remanenteCentavos)}`;
}

async function main() {
  titulo('Cliente');
  const crudos = ['0341 15 555-1234', '3415551234', '+54 9 341 5551234'];
  for (const crudo of crudos) {
    linea(`"${crudo}" → ${normalizarTelefono(crudo)} (${formatearTelefono(normalizarTelefono(crudo))})`);
  }

  titulo('1. Cobros en efectivo (acreditan)');
  for (const [ref, importe] of [
    ['manual:0001', '25000'],
    ['manual:0002', '16000'],
    ['manual:0003', '29700'], // buzo con frisa bordado
  ] as const) {
    const r = await motor.acreditar({
      cuentaId: CUENTA,
      referenciaExterna: ref,
      importeCentavos: parsearImporte(importe),
      centavosPorPunto: CENTAVOS_POR_PUNTO,
      contexto: CONTEXTO,
    });
    linea(
      `${ref} ${formatearPesos(parsearImporte(importe)).padStart(10)} → +${r.movimiento?.puntos} punto(s) · ${await estado()}`,
    );
  }

  titulo('2. Reintento del mismo cobro (idempotencia)');
  const reintento = await motor.acreditar({
    cuentaId: CUENTA,
    referenciaExterna: 'manual:0001',
    importeCentavos: parsearImporte('25000'),
    centavosPorPunto: CENTAVOS_POR_PUNTO,
    contexto: CONTEXTO,
  });
  linea(`ya aplicado: ${reintento.yaAplicado} · ${await estado()}`);

  titulo('3. Canje sobre una venta de $41.800 (campera canguro con frisa bordada)');
  const totalVenta = parsearImporte('41800');
  try {
    await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 6,
      totalVentaCentavos: totalVenta,
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_CANJE_BPS,
      beneficiosAplicados: [],
      contexto: CONTEXTO,
    });
  } catch (error) {
    linea(`6 puntos → rechazado: ${(error as Error).message}`);
  }
  const canje = await motor.canjear({
    cuentaId: CUENTA,
    puntosPedidos: 4,
    totalVentaCentavos: totalVenta,
    valorPuntoCentavos: VALOR_PUNTO,
    topeCanjeBps: TOPE_CANJE_BPS,
    beneficiosAplicados: [],
    referenciaExterna: 'venta:0007',
    contexto: CONTEXTO,
  });
  linea(`4 puntos → descuento ${formatearPesos(canje.descuentoCentavos)} · ${await estado()}`);

  titulo('4. Canje con otro beneficio ya aplicado (no se acumula)');
  try {
    await motor.canjear({
      cuentaId: CUENTA,
      puntosPedidos: 1,
      totalVentaCentavos: totalVenta,
      valorPuntoCentavos: VALOR_PUNTO,
      topeCanjeBps: TOPE_CANJE_BPS,
      beneficiosAplicados: ['DESCUENTO_CONTADO_10'],
      contexto: CONTEXTO,
    });
  } catch (error) {
    linea(`rechazado: ${(error as Error).message}`);
  }

  titulo('5. Anulación del primer pago (movimiento inverso, no se borra nada)');
  const reversa = await motor.revertir({
    cuentaId: CUENTA,
    referenciaExterna: 'manual:0001',
    motivo: 'Se anuló la venta en caja',
    contexto: CONTEXTO,
  });
  linea(`REVERSA ${reversa.movimiento?.puntos} punto(s) · ${await estado()}`);

  titulo('6. Cierre de temporada');
  const vencimiento = await motor.vencer({
    cuentaId: CUENTA,
    temporadaId: 'temporada-2026',
    contexto: { usuarioId: null, localId: null },
  });
  linea(`VENCIMIENTO ${vencimiento.movimiento?.puntos ?? 0} punto(s) · ${await estado()}`);

  titulo('Libro mayor');
  for (const m of repo.movimientosDe(CUENTA)) {
    linea(
      `${m.tipo.padEnd(13)} ${String(m.puntos).padStart(4)} pts · ` +
        `remanente ${formatearPesos(m.remanenteResultanteCentavos).padStart(9)} · ` +
        `${m.referenciaExterna ?? '—'}`,
    );
  }
  linea(`\n  ${repo.movimientosDe(CUENTA).length} movimientos, ninguno modificado ni borrado.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
