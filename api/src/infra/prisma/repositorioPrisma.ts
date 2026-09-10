/**
 * Adaptador del libro mayor contra PostgreSQL.
 *
 * Toda operación abre transacción y bloquea la fila de la cuenta con
 * `SELECT ... FOR UPDATE` antes de leer el saldo (D-007): dos cajas no pueden
 * gastar el mismo saldo. El saldo se recalcula desde los movimientos, siempre
 * dentro de la transacción; `CuentaPuntos.saldoCacheado` es sólo caché (D-004).
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { TipoDeMovimiento } from '../../dominio/tipos.js';
import type {
  EstadoDeCuenta,
  Movimiento,
  MovimientoNuevo,
  RepositorioPuntos,
  TxPuntos,
} from '../../motor/puertos.js';

type TxCliente = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Fila de Prisma -> tipo del puerto. */
function aMovimiento(fila: {
  id: string;
  cuentaId: string;
  tipo: string;
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
  metadata: unknown;
}): Movimiento {
  return {
    id: fila.id,
    cuentaId: fila.cuentaId,
    tipo: fila.tipo as TipoDeMovimiento,
    puntos: fila.puntos,
    montoOrigenCentavos: fila.montoOrigenCentavos,
    remanenteResultanteCentavos: fila.remanenteResultanteCentavos,
    referenciaExterna: fila.referenciaExterna,
    centavosPorPuntoAplicado: fila.centavosPorPuntoAplicado,
    valorPuntoAplicadoCentavos: fila.valorPuntoAplicadoCentavos,
    movimientoRevertidoId: fila.movimientoRevertidoId,
    motivo: fila.motivo,
    localId: fila.localId,
    usuarioId: fila.usuarioId,
    creadoEn: fila.creadoEn,
    metadata: (fila.metadata as Record<string, unknown> | null) ?? null,
  };
}

export class TxPuntosPrisma implements TxPuntos {
  constructor(readonly tx: TxCliente) {}

  async estadoDeCuenta(cuentaId: string): Promise<EstadoDeCuenta> {
    const [suma, ultimo] = await Promise.all([
      this.tx.movimiento.aggregate({ where: { cuentaId }, _sum: { puntos: true } }),
      this.tx.movimiento.findFirst({
        where: { cuentaId },
        orderBy: { secuencia: 'desc' },
        select: { remanenteResultanteCentavos: true },
      }),
    ]);
    return {
      cuentaId,
      saldoPuntos: suma._sum.puntos ?? 0,
      remanenteCentavos: ultimo?.remanenteResultanteCentavos ?? 0n,
    };
  }

  async buscarMovimiento(
    tipo: TipoDeMovimiento,
    referenciaExterna: string,
  ): Promise<Movimiento | null> {
    const fila = await this.tx.movimiento.findFirst({
      where: { tipo, referenciaExterna },
    });
    return fila ? aMovimiento(fila) : null;
  }

  async insertarMovimiento(datos: MovimientoNuevo): Promise<Movimiento> {
    const fila = await this.tx.movimiento.create({
      data: {
        cuentaId: datos.cuentaId,
        tipo: datos.tipo,
        puntos: datos.puntos,
        montoOrigenCentavos: datos.montoOrigenCentavos,
        remanenteResultanteCentavos: datos.remanenteResultanteCentavos,
        referenciaExterna: datos.referenciaExterna,
        centavosPorPuntoAplicado: datos.centavosPorPuntoAplicado,
        valorPuntoAplicadoCentavos: datos.valorPuntoAplicadoCentavos,
        movimientoRevertidoId: datos.movimientoRevertidoId,
        motivo: datos.motivo,
        localId: datos.localId,
        usuarioId: datos.usuarioId,
        creadoEn: datos.creadoEn,
        metadata: (datos.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return aMovimiento(fila);
  }

  /** Caché derivada del libro mayor. Nunca se incrementa: se pisa con el recálculo. */
  async refrescarCache(cuentaId: string, estado: EstadoDeCuenta): Promise<void> {
    await this.tx.cuentaPuntos.update({
      where: { id: cuentaId },
      data: {
        saldoCacheado: estado.saldoPuntos,
        remanenteCentavos: estado.remanenteCentavos,
        cacheActualizadoEn: new Date(),
      },
    });
  }
}

export class RepositorioPrisma implements RepositorioPuntos {
  constructor(private readonly prisma: PrismaClient) {}

  async conCuentaBloqueada<T>(cuentaId: string, fn: (tx: TxPuntos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // Bloqueo de fila: serializa las operaciones sobre esta cuenta (D-007).
        const filas = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "CuentaPuntos" WHERE id = ${cuentaId}::uuid FOR UPDATE`;
        if (filas.length === 0) {
          throw new Error(`La cuenta ${cuentaId} no existe`);
        }
        return fn(new TxPuntosPrisma(tx));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 },
    );
  }
}
