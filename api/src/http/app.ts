import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { ErrorDeNegocio } from '../dominio/tipos.js';
import { exigeContrasenaPropia, exigeSesion } from './sesion.js';
import { rutasDeAuth } from './rutas/auth.js';
import { rutasDeClientes } from './rutas/clientes.js';
import { rutasDeCobros } from './rutas/cobros.js';
import { rutasDeCanjes } from './rutas/canjes.js';
import { rutasDeAdmin } from './rutas/admin.js';
import { rutasDePersonal } from './rutas/personal.js';
import { rutasDeArticulos } from './rutas/articulos.js';
import { rutasPublicas } from './rutas/publicas.js';
import { limitePorIp } from '../servicios/limitePorIp.js';

export function crearApp() {
  const app = express();

  /**
   * Detrás de Traefik. Sin esto, los límites por IP verían siempre la del proxy
   * y bloquearían a todos los clientes juntos con el primero que abuse.
   */
  app.set('trust proxy', 1);

  /**
   * Cabeceras de seguridad (D-044). La que más importa acá es `frame-ancestors`:
   * sin ella, cualquiera puede meter el mostrador en un iframe invisible sobre
   * su página y hacer que una vendedora con la sesión abierta apriete botones
   * que no quiso apretar. Es una pantalla que cobra plata y está abierta todo el
   * día.
   *
   * La CSP está ajustada a lo que la aplicación usa de verdad, no copiada:
   * el único origen externo son las tipografías de Google.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // El build de Vite no deja scripts en línea: no hace falta abrir la mano.
          scriptSrc: ["'self'"],
          // `'unsafe-inline'` va por los `style={{…}}` de React, que son
          // atributos y no scripts. El riesgo real es nulo sin XSS, y no hay.
          styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          // `data:` y `blob:` por el QR, que se dibuja en un canvas.
          imgSrc: ["'self'", 'data:', 'blob:'],
          // El escáner del mostrador abre la cámara: eso es `media-src`.
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // Un año de HTTPS obligatorio. El dominio ya es HTTPS y no hay vuelta atrás.
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      // Estas dos rompen cosas y no aportan acá: no cargamos recursos de otros
      // orígenes ni necesitamos aislamiento de agente.
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  /**
   * La cámara del escáner tiene que seguir andando; el resto se apaga. Helmet no
   * escribe esta cabecera, así que va a mano.
   */
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });

  app.use(
    cors({
      origin: (process.env.CORS_ORIGEN ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  // Los importes viajan como string: BigInt no tiene representación en JSON (D-002).
  app.set('json replacer', (_clave: string, valor: unknown) =>
    typeof valor === 'bigint' ? valor.toString() : valor,
  );

  app.get('/api/salud', (_req, res) => res.json({ ok: true, ahora: new Date().toISOString() }));

  /**
   * Límites por IP (D-044). Están todos juntos y no repartidos por las rutas a
   * propósito: así se puede auditar de un vistazo qué está protegido y qué no.
   *
   * Los tres primeros son los que **gastan el WhatsApp de la empresa**. Un
   * teléfono inventado puede ser de una persona real, y el número que manda es
   * el de la casa: si se usa para spam, WhatsApp lo banea y se cae el registro
   * de todos los clientes.
   */
  const MENSAJE_ESPERA = 'Hiciste esto muchas veces seguidas. Esperá un rato y probá de nuevo.';

  app.use(
    '/api/publico/cuenta/registrar',
    limitePorIp({ nombre: 'registro', cuantos: 3, porMinutos: 60, mensaje: MENSAJE_ESPERA }),
  );
  app.use(
    '/api/publico/cuenta/recuperar',
    limitePorIp({ nombre: 'recuperar', cuantos: 5, porMinutos: 60, mensaje: MENSAJE_ESPERA }),
  );
  app.use(
    '/api/publico/acceso/pedir',
    limitePorIp({ nombre: 'codigo', cuantos: 5, porMinutos: 60, mensaje: MENSAJE_ESPERA }),
  );

  // Los que prueban credenciales. El ingreso del personal además tiene su propio
  // freno por usuario (D-035); esto es por si alguien rota nombres de usuario.
  for (const ruta of [
    '/api/publico/cuenta/ingresar',
    '/api/publico/cuenta/confirmar',
    '/api/publico/cuenta/restablecer',
    '/api/auth/ingresar',
  ]) {
    app.use(
      ruta,
      limitePorIp({ nombre: 'credenciales', cuantos: 20, porMinutos: 15, mensaje: MENSAJE_ESPERA }),
    );
  }

  /**
   * Techo general. Alto a propósito: la búsqueda del mostrador dispara un pedido
   * por tecla, y seis locales pueden salir por la misma IP. Esto no frena a
   * nadie trabajando; frena a quien martilla la base.
   */
  app.use(
    '/api',
    limitePorIp({ nombre: 'general', cuantos: 300, porMinutos: 1, mensaje: MENSAJE_ESPERA }),
  );

  app.use('/api/auth', rutasDeAuth());

  // Todo lo que opera queda cerrado mientras la contraseña la sepa otro (D-034).
  // `/api/auth` queda afuera a propósito: es por donde se sale de esa situación.
  const operativas = [exigeSesion, exigeContrasenaPropia];
  app.use('/api/clientes', operativas, rutasDeClientes());
  app.use('/api/cobros', operativas, rutasDeCobros());
  app.use('/api/canjes', operativas, rutasDeCanjes());
  app.use('/api/admin', operativas, rutasDeAdmin());
  app.use('/api/personal', operativas, rutasDePersonal());
  app.use('/api/articulos', operativas, rutasDeArticulos());
  app.use('/api/publico', rutasPublicas());

  /**
   * En producción este mismo servicio sirve la web (D-032). Un solo dominio para
   * el mostrador, el panel y la app del cliente: sin CORS, sin proxy, y el link
   * que se manda por WhatsApp vive en la misma dirección que todo lo demás.
   */
  const web = path.resolve(process.cwd(), process.env.WEB_DIST ?? '../web/dist');
  const hayWeb = existsSync(path.join(web, 'index.html'));

  if (hayWeb) {
    app.use(
      express.static(web, {
        // El armazón se revalida siempre; los assets llevan hash en el nombre.
        setHeaders: (res, archivo) => {
          if (archivo.endsWith('index.html') || archivo.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (archivo.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
  }

  // Lo que no existe bajo /api es 404 de verdad; el resto lo resuelve la web.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NO_ENCONTRADO' }));

  app.use((req, res, next) => {
    if (!hayWeb || req.method !== 'GET') {
      return res.status(404).json({ error: 'NO_ENCONTRADO' });
    }
    return res.sendFile(path.join(web, 'index.html'), (error) => (error ? next(error) : undefined));
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ErrorDeNegocio) {
      return res.status(422).json({
        error: error.codigo,
        mensaje: error.message,
        detalle: error.detalle ?? null,
      });
    }
    /**
     * Un cuerpo malformado es culpa de quien llama, no del servidor (D-049).
     *
     * Hasta acá cualquier `ZodError` caía al 500 de abajo: el que llamaba leía
     * "Algo salió mal" cuando lo que pasaba era que había mandado un talle que
     * no existe, y el error quedaba en los logs del servidor mezclado con los
     * que sí son nuestros. Dos problemas: no se puede corregir lo que no se
     * sabe, y las fallas reales quedan escondidas entre las ajenas.
     */
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'DATOS_INVALIDOS',
        mensaje: 'Revisá los datos: hay algo que no tiene el formato esperado.',
        // Qué campo y por qué. Nunca el valor recibido: puede ser una contraseña.
        detalle: error.issues.map((i) => ({
          campo: i.path.join('.') || '(cuerpo)',
          problema: i.message,
        })),
      });
    }

    const conCodigo = error as { code?: string; message?: string };
    if (conCodigo?.code === 'P2002') {
      return res.status(409).json({ error: 'DUPLICADO', mensaje: 'La operación ya fue registrada' });
    }
    console.error(error);
    return res.status(500).json({
      error: 'ERROR_INTERNO',
      mensaje: 'Algo salió mal. Probá de nuevo.',
    });
  });

  return app;
}
