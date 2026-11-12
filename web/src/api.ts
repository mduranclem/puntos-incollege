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
  /** Sin cuenta en la app no se le puede cobrar (D-060). */
  tieneCuenta: boolean;
  cuentaId: string;
  saldoPuntos: number;
  equivalenteTexto: string;
  remanenteTexto: string;
  faltaParaElProximoTexto: string;
  valorPuntoCentavos: string;
  topeCanjeBps: number;
  temporada: { nombre: string };
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

/**
 * Dónde cae cada uno al entrar. Un vendedor viene a cobrar; la gerencia viene al
 * panel. El link es el mismo para todos (`/mostrador`, D-038): lo que cambia es
 * la pantalla, no la dirección que se reparte.
 */
export const inicioSegunRol = (sesion: Sesion | null): string =>
  sesion?.rol === 'GERENTE' ? '/mostrador/admin' : '/mostrador';

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

export const TALLES = ['4-10', '12-16', 'S-XL', 'ESP'] as const;
export type Talle = (typeof TALLES)[number];

/** El precio de una prenda en un talle (D-049). */
export type PrecioDeTalle = {
  talle: Talle;
  precioCentavos: string;
  precioTexto: string;
  actualizadoEn: string;
  /** Quién lo tocó por última vez. `null` si nunca se editó desde el panel. */
  actualizadoPor: string | null;
};

export type Articulo = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  detalle: string | null;
  /** El precio del talle base. Es el de entrada, cuando no se eligió talle. */
  precioCentavos: string;
  precioTexto: string;
  precios: PrecioDeTalle[];
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
  /** Qué talle se eligió. Vacío en lo cargado a mano con "Otro". */
  talle?: Talle;
  precioUnitarioCentavos: number;
  /**
   * De qué línea es el artículo, cuando salió del catálogo. Con esto la
   * pantalla deduce la línea de la venta sin preguntarla (D-043). Vacío en los
   * artículos cargados a mano con "Otro": de esos no se sabe.
   */
  lineaDeNegocio?: 'UNIFORMES' | 'ROPA_LISA' | 'EGRESADOS';
};

/**
 * Una forma de pago del mostrador, con su recargo (D-061). Las manda la API:
 * los botones no están escritos en esta pantalla, así cambiar un arancel no es
 * un despliegue.
 */
export type FormaDePago = {
  codigo: string;
  nombre: string;
  medioDePago: string;
  recargoBps: number;
  recargoTexto: string;
  cuotas: number;
  /** Sólo el efectivo suma puntos (D-001). */
  acredita: boolean;
};

/**
 * El recargo sobre un precio de lista, en centavos.
 *
 * Es el mismo cálculo que hace el servidor —redondeo al peso entero, para
 * arriba en el empate (D-061)— porque la pantalla tiene que mostrar antes de
 * cobrar exactamente lo que se va a cobrar. El que manda es el servidor: acá se
 * calcula para mostrar, no para cobrar.
 */
export const calcularRecargo = (baseCentavos: number, recargoBps: number): number =>
  recargoBps <= 0 || baseCentavos <= 0 ? 0 : Math.round((baseCentavos * recargoBps) / 1_000_000) * 100;

/**
 * Lo que tipeó el vendedor, en centavos, para poder mostrar el total con
 * recargo antes de confirmar. Convención rioplatense: la coma es decimal.
 *
 * Es una lectura **para mostrar**. El que parsea de verdad y decide cuánto se
 * cobra es el servidor (D-049): si acá se leyera distinto, lo que manda es lo
 * que devuelve la API y la pantalla lo muestra en el comprobante.
 */
export function leerImporte(texto: string): number {
  const limpio = texto.trim().replace(/[\s$]/g, '');
  if (!limpio) return 0;
  const conPunto = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : /^\d+\.\d{1,2}$/.test(limpio)
      ? limpio
      : limpio.replace(/\./g, '');
  const pesos = Number(conPunto);
  return Number.isFinite(pesos) ? Math.round(pesos * 100) : 0;
}

export const totalDeItems = (items: ItemElegido[]) =>
  items.reduce((suma, i) => suma + i.precioUnitarioCentavos * i.cantidad, 0);

/** Lo que espera la API: sin la clave interna ni el precio si sale del catálogo. */
export const itemsParaLaApi = (items: ItemElegido[]) =>
  items.map((i) => ({
    ...(i.articuloId ? { articuloId: i.articuloId } : { descripcion: i.descripcion }),
    cantidad: i.cantidad,
    ...(i.talle ? { talle: i.talle } : {}),
    // De lo que sale del catálogo no se manda precio: lo resuelve el servidor,
    // que es el único que decide cuánto cuesta algo.
    ...(i.articuloId ? {} : { precioUnitario: String(i.precioUnitarioCentavos / 100) }),
  }));
