/** Cliente HTTP. Los importes viajan como string (BigInt en el backend). */

export type Sesion = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  rol: 'VENDEDOR' | 'GERENTE';
  /** La contraseña la puso otro: no puede operar hasta cambiarla (D-034). */
  debeCambiarContrasena: boolean;
  localId: string;
  localCodigo: string;
  localNombre: string;
  codigoAreaPorDefecto: string;
};

export type Movimiento = {
  id: string;
  fecha: string;
  tipo: 'ACREDITACION' | 'CANJE' | 'VENCIMIENTO' | 'REVERSA' | 'AJUSTE';
  puntos: number;
  montoTexto: string | null;
  local: string | null;
  motivo: string | null;
};

export type ResumenDeCuenta = {
  cliente: { id: string; nombre: string; telefono: string; telefonoE164: string };
  cuentaId: string;
  saldoPuntos: number;
  equivalenteTexto: string;
  remanenteTexto: string;
  faltaParaElProximoTexto: string;
  valorPuntoCentavos: string;
  topeCanjeBps: number;
  temporada: { nombre: string; venceEn: string };
  movimientos: Movimiento[];
};

export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

const CLAVE_TOKEN = 'puntos.token';
const CLAVE_SESION = 'puntos.sesion';

export const guardarSesion = (token: string, sesion: Sesion) => {
  localStorage.setItem(CLAVE_TOKEN, token);
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
};

export const leerSesion = (): Sesion | null => {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION);
    return crudo ? (JSON.parse(crudo) as Sesion) : null;
  } catch {
    return null;
  }
};

export const cerrarSesion = () => {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_SESION);
};

export async function api<T>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown; publico?: boolean } = {},
): Promise<T> {
  const token = localStorage.getItem(CLAVE_TOKEN);
  const respuesta = await fetch(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token && !opciones.publico ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (!respuesta.ok) {
    if (respuesta.status === 401 && !opciones.publico) {
      cerrarSesion();
      if (!location.pathname.startsWith('/mostrador/ingresar')) {
        location.assign('/mostrador/ingresar');
      }
    }
    throw new ErrorApi(
      datos?.error ?? 'ERROR',
      datos?.mensaje ?? 'No se pudo completar la operación',
      respuesta.status,
      datos?.detalle,
    );
  }
  return datos as T;
}

/** "$25.000" — los importes llegan en centavos como string (BigInt en el backend). */
export function formatearPesos(centavos: number | string): string {
  const n = typeof centavos === 'string' ? Number(centavos) : centavos;
  const negativo = n < 0;
  const abs = Math.abs(Math.round(n));
  const pesos = Math.floor(abs / 100);
  const resto = abs % 100;
  const conMiles = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}$${conMiles}${resto === 0 ? '' : `,${String(resto).padStart(2, '0')}`}`;
}

export type Articulo = {
  id: string;
  nombre: string;
  detalle: string | null;
  precioCentavos: string;
  precioTexto: string;
  lineaDeNegocio: 'UNIFORMES' | 'ROPA_LISA' | 'EGRESADOS' | null;
  orden: number;
  activo: boolean;
  visibleEnApp: boolean;
};

/** Una línea de la venta, tal como la arma la pantalla. */
export type ItemElegido = {
  clave: string;
  articuloId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number;
};

export const totalDeItems = (items: ItemElegido[]) =>
  items.reduce((suma, i) => suma + i.precioUnitarioCentavos * i.cantidad, 0);

/** Lo que espera la API: sin la clave interna ni el precio si sale del catálogo. */
export const itemsParaLaApi = (items: ItemElegido[]) =>
  items.map((i) => ({
    ...(i.articuloId ? { articuloId: i.articuloId } : { descripcion: i.descripcion }),
    cantidad: i.cantidad,
    ...(i.articuloId ? {} : { precioUnitario: String(i.precioUnitarioCentavos / 100) }),
  }));
