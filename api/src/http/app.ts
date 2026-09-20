import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

export function crearApp() {
  const app = express();

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
