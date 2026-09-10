/**
 * Adaptador en memoria del libro mayor. Se usa en los tests del motor y en la
 * simulación por consola, para que el motor se pueda probar en cualquier máquina
 * sin base de datos (D-015).
 *
 * Respeta los mismos contratos que el adaptador de Prisma:
 *  - unicidad de (tipo, referenciaExterna),
 *  - una sola operación por cuenta a la vez (equivalente a SELECT ... FOR UPDATE).
 */
import { randomUUID } from 'node:crypto';
import type {
  EstadoDeCuenta,
  Movimiento,
  MovimientoNuevo,
  RepositorioPuntos,
  TxPuntos,
} from '../../motor/puertos.js';
import type { TipoDeMovimiento } from '../../dominio/tipos.js';

export class RepositorioEnMemoria implements RepositorioPuntos, TxPuntos {
  readonly movimientos: Movimiento[] = [];
  readonly cache = new Map<string, EstadoDeCuenta>();
  private readonly claves = new Set<string>();
  private colas = new Map<string, Promise<unknown>>();

  async conCuentaBloqueada<T>(cuentaId: string, fn: (tx: TxPuntos) => Promise<T>): Promise<T> {
    const anterior = this.colas.get(cuentaId) ?? Promise.resolve();
    const corrida = anterior.then(() => fn(this));
    // La cola sigue viva aunque la operación falle.
    this.colas.set(
      cuentaId,
      corrida.then(
        () => undefined,
        () => undefined,
      ),
    );
    return corrida;
  }

  async estadoDeCuenta(cuentaId: string): Promise<EstadoDeCuenta> {
    const propios = this.movimientos.filter((m) => m.cuentaId === cuentaId);
    const saldoPuntos = propios.reduce((total, m) => total + m.puntos, 0);
    const ultimo = propios[propios.length - 1];
    return {
      cuentaId,
      saldoPuntos,
      remanenteCentavos: ultimo ? ultimo.remanenteResultanteCentavos : 0n,
    };
  }

  async buscarMovimiento(
    tipo: TipoDeMovimiento,
    referenciaExterna: string,
  ): Promise<Movimiento | null> {
    return (
      this.movimientos.find(
        (m) => m.tipo === tipo && m.referenciaExterna === referenciaExterna,
      ) ?? null
    );
  }

  async insertarMovimiento(datos: MovimientoNuevo): Promise<Movimiento> {
    if (datos.referenciaExterna) {
      const clave = `${datos.tipo}::${datos.referenciaExterna}`;
      if (this.claves.has(clave)) {
        // Equivale a la violación de la restricción única del motor de base (D-006).
        const error = new Error(`Movimiento duplicado: ${clave}`) as Error & { code: string };
        error.code = 'P2002';
        throw error;
      }
      this.claves.add(clave);
    }
    const movimiento: Movimiento = { id: randomUUID(), ...datos };
    this.movimientos.push(movimiento);
    return movimiento;
  }

  async refrescarCache(cuentaId: string, estado: EstadoDeCuenta): Promise<void> {
    this.cache.set(cuentaId, { ...estado });
  }

  /** Ayuda de tests: movimientos de una cuenta, en orden. */
  movimientosDe(cuentaId: string): Movimiento[] {
    return this.movimientos.filter((m) => m.cuentaId === cuentaId);
  }
}
