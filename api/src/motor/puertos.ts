/**
 * Puertos del motor de puntos.
 *
 * El motor no sabe de dónde viene un pago (D-003) ni contra qué base escribe:
 * habla con `RepositorioPuntos` y recibe `PagoNormalizado`. Hoy hay una sola
 * fuente (carga manual en el mostrador) y dos adaptadores de repositorio
 * (Prisma y en memoria, este último para los tests).
 */
import type {
  LineaDeNegocio,
  MedioDePago,
  TipoDeMovimiento,
} from '../dominio/tipos.js';

// ---------------------------------------------------------------------------
// Fuente de pagos
// ---------------------------------------------------------------------------

export type PagoNormalizado = {
  /** Clave de idempotencia. Única en todo el sistema. Ej: `manual:<uuid>`, `siro:00012345`. */
  referenciaExterna: string;
  ocurridoEn: Date;
  importeCentavos: bigint;
  medioDePago: MedioDePago;
  lineaDeNegocio: LineaDeNegocio;
  localCodigo: string;
  cliente: {
    telefonoCrudo: string;
    nombre?: string;
    documento?: string;
    /** Identificador del cliente en el sistema de origen, si lo hay. */
    idExterno?: string;
  };
  /** Usuario que lo cargó, cuando la fuente lo conoce (carga manual). */
  usuarioId?: string;
  /** Crudo de la fuente, para auditoría. */
  metadata?: Record<string, unknown>;
};

export type Cursor = {
  desde: Date | null;
  ultimaReferencia: string | null;
};

export interface FuenteDePagos {
  /** 'manual' | 'siro' | ... */
  readonly nombre: string;
  traerPagosNuevos(
    cursor: Cursor,
    limite: number,
  ): Promise<{ pagos: PagoNormalizado[]; cursor: Cursor }>;
  /** La fuente marca lo ya procesado, si su medio lo permite. */
  marcarProcesados?(referencias: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Repositorio del libro mayor
// ---------------------------------------------------------------------------

export type Contexto = {
  usuarioId: string | null;
  localId: string | null;
  ocurridoEn?: Date;
};

export type MovimientoNuevo = {
  cuentaId: string;
  tipo: TipoDeMovimiento;
  puntos: number;
  montoOrigenCentavos: bigint | null;
  remanenteResultanteCentavos: bigint;
  referenciaExterna: string | null;
  centavosPorPuntoAplicado: bigint | null;
  valorPuntoAplicadoCentavos: bigint | null;
  movimientoRevertidoId: string | null;
  motivo: string | null;
  localId: string | null;
  usuarioId: string | null;
  creadoEn: Date;
  metadata?: Record<string, unknown> | null;
};

export type Movimiento = MovimientoNuevo & { id: string };

export type EstadoDeCuenta = {
  cuentaId: string;
  saldoPuntos: number;
  remanenteCentavos: bigint;
};

/**
 * Operaciones dentro de una transacción con la fila de la cuenta bloqueada
 * (`SELECT ... FOR UPDATE`). Ver D-007.
 */
export interface TxPuntos {
  /** Saldo y remanente recalculados desde los movimientos, no desde la caché. */
  estadoDeCuenta(cuentaId: string): Promise<EstadoDeCuenta>;
  buscarMovimiento(tipo: TipoDeMovimiento, referenciaExterna: string): Promise<Movimiento | null>;
  insertarMovimiento(movimiento: MovimientoNuevo): Promise<Movimiento>;
  /** Refresca la caché de la cuenta desde el libro mayor (D-004). */
  refrescarCache(cuentaId: string, estado: EstadoDeCuenta): Promise<void>;
}

export interface RepositorioPuntos {
  /** Abre la transacción y bloquea la fila de la cuenta antes de ejecutar `fn`. */
  conCuentaBloqueada<T>(cuentaId: string, fn: (tx: TxPuntos) => Promise<T>): Promise<T>;
}
