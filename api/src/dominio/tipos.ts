/**
 * Tipos del dominio. Se definen a mano (y no se importan de `@prisma/client`)
 * para que el motor de puntos y sus tests no dependan del cliente generado
 * ni de una base de datos. El schema de Prisma los espeja.
 */

export const LINEAS_DE_NEGOCIO = ['UNIFORMES', 'ROPA_LISA', 'EGRESADOS'] as const;
export type LineaDeNegocio = (typeof LINEAS_DE_NEGOCIO)[number];

/** Líneas habilitadas en esta entrega. Egresados se integra más adelante (D-003). */
export const LINEAS_HABILITADAS: LineaDeNegocio[] = ['UNIFORMES', 'ROPA_LISA'];

export const MEDIOS_DE_PAGO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA_DEBITO',
  'TARJETA_CREDITO',
  'QR',
  'BILLETERA_VIRTUAL',
  'OTRO',
] as const;
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number];

/** Único medio que acredita puntos. El resto se registra y no acredita. */
export const MEDIO_QUE_ACREDITA: MedioDePago = 'EFECTIVO';

export const TIPOS_DE_MOVIMIENTO = [
  'ACREDITACION',
  'CANJE',
  'VENCIMIENTO',
  'REVERSA',
  'AJUSTE',
] as const;
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number];

/**
 * Otros beneficios comerciales de la casa. El canje de puntos no se acumula con
 * ninguno de estos (D-008): un solo beneficio por operación.
 */
export const BENEFICIOS_COMERCIALES = [
  'DESCUENTO_CONTADO_10',
  'BONIFICACION_PRIMERA_CUOTA_50',
] as const;
export type BeneficioComercial = (typeof BENEFICIOS_COMERCIALES)[number];

export const ROLES = ['VENDEDOR', 'ADMINISTRADOR'] as const;
export type Rol = (typeof ROLES)[number];

export const ORIGENES_DE_PAGO = ['MANUAL', 'SIRO'] as const;
export type OrigenDePago = (typeof ORIGENES_DE_PAGO)[number];

export const ESTADOS_DE_PAGO = [
  'PENDIENTE',
  'ACREDITADO',
  'NO_ACREDITABLE',
  'ANULADO',
] as const;
export type EstadoDePago = (typeof ESTADOS_DE_PAGO)[number];

/** Error de regla de negocio: la API lo traduce a HTTP 422. */
export class ErrorDeNegocio extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
  }
}
