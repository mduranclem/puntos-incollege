/**
 * Límite de pedidos por IP (D-044).
 *
 * El caso que lo hizo necesario: `POST /publico/cuenta/registrar` es un endpoint
 * **sin autenticación** que hace que el WhatsApp de la empresa le mande un
 * mensaje a cualquier número. El único freno que había era de 5 códigos por
 * hora **por teléfono**, así que un script que recorriera números podía mandar
 * miles de mensajes. Eso no es sólo costo: WhatsApp banea el número por envío
 * masivo, y de ese número dependen registrarse y recuperar la contraseña.
 *
 * **Ventana fija, no deslizante.** Es más simple y para este tamaño alcanza: la
 * diferencia entre las dos sólo se nota justo en el borde de la ventana, y el
 * que abusa igual queda limitado al doble del cupo en el peor caso.
 *
 * Vive en memoria, igual que el freno de ingreso (D-035). Es un solo proceso
 * (D-032). Se pierde al reiniciar, y eso está bien: lo que frena es el ritmo de
 * un ataque en curso, no un total histórico.
 */
import type { NextFunction, Request, Response } from 'express';

const MINUTO = 60_000;

type Registro = { cuenta: number; desde: number };

/** Un mapa por límite, así dos límites distintos no se pisan. */
type Opciones = {
  /** Aparece en el mapa y en los tests. No se le muestra a nadie. */
  nombre: string;
  cuantos: number;
  porMinutos: number;
  /** Lo que lee la persona. Tiene que decirle qué hacer. */
  mensaje: string;
};

const mapas = new Map<string, Map<string, Registro>>();

function mapaDe(nombre: string): Map<string, Registro> {
  let m = mapas.get(nombre);
  if (!m) {
    m = new Map();
    mapas.set(nombre, m);
  }
  return m;
}

/**
 * Quién pide. Con `trust proxy` puesto, `req.ip` es la IP real del cliente y no
 * la de Traefik. Si no se puede determinar, todos los anónimos comparten cupo:
 * es preferible a no limitar nada.
 */
function quien(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'desconocido';
}

export function limitePorIp({ nombre, cuantos, porMinutos, mensaje }: Opciones) {
  const ventana = porMinutos * MINUTO;

  return function limitar(req: Request, res: Response, next: NextFunction) {
    const mapa = mapaDe(nombre);
    const clave = quien(req);
    const ahora = Date.now();
    const registro = mapa.get(clave);

    if (!registro || ahora - registro.desde >= ventana) {
      mapa.set(clave, { cuenta: 1, desde: ahora });
      return next();
    }

    registro.cuenta += 1;
    if (registro.cuenta <= cuantos) return next();

    const faltanSeg = Math.ceil((registro.desde + ventana - ahora) / 1000);
    res.setHeader('Retry-After', String(faltanSeg));
    return res.status(429).json({
      error: 'DEMASIADOS_PEDIDOS',
      mensaje,
      detalle: { esperaSegundos: faltanSeg },
    });
  };
}

/** Sólo para los tests. */
export function olvidarLimites(): void {
  mapas.clear();
}
