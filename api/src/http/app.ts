import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ErrorDeNegocio } from '../dominio/tipos.js';
import { rutasDeAuth } from './rutas/auth.js';
import { rutasDeClientes } from './rutas/clientes.js';
import { rutasDeCobros } from './rutas/cobros.js';
import { rutasDeCanjes } from './rutas/canjes.js';
import { rutasDeAdmin } from './rutas/admin.js';
import { rutasDePersonal } from './rutas/personal.js';
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
  app.use('/api/clientes', rutasDeClientes());
  app.use('/api/cobros', rutasDeCobros());
  app.use('/api/canjes', rutasDeCanjes());
  app.use('/api/admin', rutasDeAdmin());
  app.use('/api/personal', rutasDePersonal());
  app.use('/api/publico', rutasPublicas());

  app.use((_req, res) => res.status(404).json({ error: 'NO_ENCONTRADO' }));

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
