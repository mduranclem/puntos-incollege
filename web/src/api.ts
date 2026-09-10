/** Cliente HTTP. Los importes viajan como string (BigInt en el backend). */

export type Sesion = {
  usuarioId: string;
  usuario: string;
  nombre: string;
  rol: 'VENDEDOR' | 'ADMINISTRADOR';
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
      if (!location.pathname.startsWith('/ingresar')) location.assign('/ingresar');
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
