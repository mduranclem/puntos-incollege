/**
 * Acceso a la API para la app del cliente.
 *
 * Guarda su propia sesión, aparte de la del personal: en un mismo celular puede
 * haber una vendedora usando el mostrador y su cuenta personal de clienta.
 */

export type Movimiento = {
  fecha: string;
  tipo: 'ACREDITACION' | 'CANJE' | 'VENCIMIENTO' | 'REVERSA' | 'AJUSTE';
  puntos: number;
  montoTexto: string | null;
  local: string | null;
};

export type Cuenta = {
  nombre: string;
  telefono: string;
  telefonoE164: string;
  saldoPuntos: number;
  equivalenteTexto: string;
  faltaParaElProximoTexto: string;
  topeCanjeBps: number;
  valorPuntoTexto: string;
  /** Cuánto hay que pagar en efectivo por cada punto. Sale de la configuración. */
  porPuntoTexto: string;
  /** Los dos en centavos, como string: con ellos se dibuja el avance real. */
  porPuntoCentavos: string;
  remanenteCentavos: string;
  temporada: { nombre: string; venceEn: string };
  movimientos: Movimiento[];
};

export type Local = {
  id: string;
  nombre: string;
  direccion: string | null;
  horarios: string | null;
  telefono: string | null;
};

export type Novedad = {
  id: string;
  titulo: string;
  detalle: string | null;
  precioTexto: string | null;
  lineaDeNegocio: 'UNIFORMES' | 'ROPA_LISA' | 'EGRESADOS' | null;
};

const CLAVE = 'puntos.cliente.token';

export const guardarAcceso = (token: string) => localStorage.setItem(CLAVE, token);
export const leerAcceso = () => localStorage.getItem(CLAVE);
export const cerrarAcceso = () => localStorage.removeItem(CLAVE);

export class ErrorCliente extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function apiCliente<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; conSesion?: boolean } = {},
): Promise<T> {
  const token = leerAcceso();
  const respuesta = await fetch(`/api/publico${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(opciones.conSesion && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    throw new ErrorCliente(
      datos?.error ?? 'ERROR',
      datos?.mensaje ?? 'No pudimos conectarnos. Probá de nuevo en un momento.',
    );
  }
  return datos as T;
}

/** Fechas cortas para las listas: "14/03". */
export const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

/** "14 de marzo de 2026" para los textos. */
export const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export const TEXTO_MOVIMIENTO: Record<Movimiento['tipo'], string> = {
  ACREDITACION: 'Puntos sumados',
  CANJE: 'Puntos usados',
  VENCIMIENTO: 'Puntos vencidos',
  REVERSA: 'Anulación',
  AJUSTE: 'Ajuste',
};

/**
 * Cómo se pinta cada tipo. El color acompaña, no informa: el signo y el texto
 * ya dicen qué pasó, para quien no distingue colores o mira con poca luz.
 */
export const CLASE_MOVIMIENTO: Record<Movimiento['tipo'], string> = {
  ACREDITACION: 'suma',
  CANJE: 'resta',
  VENCIMIENTO: 'vence',
  REVERSA: 'resta',
  AJUSTE: 'resta',
};
