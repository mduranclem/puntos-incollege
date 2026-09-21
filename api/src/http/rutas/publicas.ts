/**
 * Todo lo que consume la app del cliente. Sin sesión de personal.
 *
 * Tres formas de identificarse, las tres con el mismo token de cliente (D-011):
 *  - la cuenta propia con mail y contraseña (D-036), que es la de todos los días;
 *  - el teléfono + código por WhatsApp (D-022), para quien no se registró;
 *  - el link firmado que manda el mostrador o el aviso automático.
 *
 * Ninguna respuesta de acá expone datos de otros clientes ni el documento.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../infra/prisma/cliente.js';
import { verificarTokenCliente } from '../../servicios/tokenCliente.js';
import { resumenDeCuenta } from '../../servicios/saldos.js';
import { confirmarCodigo, pedirCodigo } from '../../servicios/accesoCliente.js';
import {
  cambiarContrasenaDelCliente,
  confirmarRegistro,
  ingresarConEmail,
  pedirCodigoDeRegistro,
  pedirRecuperacion,
  restablecerContrasena,
} from '../../servicios/cuentaCliente.js';
import { esperaPendiente, registrarExito, registrarFallo } from '../../servicios/intentosDeIngreso.js';
import { formatearPesos } from '../../dominio/dinero.js';

const Pedido = z.object({ telefono: z.string().min(3).max(30) });

const Registro = z.object({
  nombre: z.string().trim().max(120).optional(),
  email: z.string().min(3).max(254),
  contrasena: z.string().min(1).max(200),
  telefono: z.string().min(3).max(30),
});
const RegistroConCodigo = Registro.extend({ codigo: z.string().min(4).max(10) });
const IngresoCliente = z.object({
  email: z.string().min(3).max(254),
  contrasena: z.string().min(1).max(200),
});
const Recuperacion = z.object({ email: z.string().min(3).max(254) });
const Restablecimiento = z.object({
  email: z.string().min(3).max(254),
  codigo: z.string().min(4).max(10),
  contrasena: z.string().min(1).max(200),
});
const CambioDeContrasena = z.object({
  contrasenaActual: z.string().min(1).max(200),
  contrasenaNueva: z.string().min(1).max(200),
});
const Confirmacion = z.object({
  telefono: z.string().min(3).max(30),
  codigo: z.string().min(4).max(10),
});

/** Resuelve el cliente a partir del token, venga del link o de la app. */
async function clienteDelToken(token: string | undefined) {
  if (!token) return null;
  const contenido = verificarTokenCliente(token);
  if (!contenido) return null;

  const cliente = await prisma.cliente.findUnique({
    where: { id: contenido.sub },
    select: { id: true, tokenVersion: true, fusionadoEnId: true },
  });
  if (!cliente || cliente.tokenVersion !== contenido.v) return null;
  return cliente;
}

/** Acepta el token por cabecera (app) o por la URL (link de WhatsApp). */
async function exigeCliente(req: Request, res: Response, next: NextFunction) {
  const cabecera = req.header('authorization') ?? '';
  const token = cabecera.startsWith('Bearer ')
    ? cabecera.slice(7)
    : (req.params.token as string | undefined);

  const cliente = await clienteDelToken(token);
  if (!cliente) {
    return res.status(404).json({
      error: 'LINK_INVALIDO',
      mensaje: 'No pudimos abrir tu cuenta. Pedí el acceso de nuevo.',
    });
  }
  res.locals.clienteId = cliente.fusionadoEnId ?? cliente.id;
  return next();
}

/** La vista completa de la cuenta: es lo que la app muestra en la pantalla principal. */
async function armarCuenta(clienteId: string, cantidadDeMovimientos: number) {
  const resumen = await resumenDeCuenta(prisma, clienteId, cantidadDeMovimientos);
  return {
    nombre: resumen.cliente.nombre,
    telefono: resumen.cliente.telefono,
    telefonoE164: resumen.cliente.telefonoE164,
    saldoPuntos: resumen.saldoPuntos,
    equivalenteTexto: resumen.equivalenteTexto,
    faltaParaElProximoTexto: resumen.faltaParaElProximoTexto,
    topeCanjeBps: resumen.topeCanjeBps,
    valorPuntoTexto: formatearPesos(BigInt(resumen.valorPuntoCentavos)),
    temporada: resumen.temporada,
    movimientos: resumen.movimientos.map((m) => ({
      fecha: m.fecha,
      tipo: m.tipo,
      puntos: m.puntos,
      montoTexto: m.montoTexto,
      local: m.local,
    })),
  };
}

export function rutasPublicas() {
  const router = Router();

  // --- Cuenta propia del cliente: mail y contraseña (D-036) ---

  /** Paso 1 del registro: valida los datos y manda el código por WhatsApp. */
  router.post('/cuenta/registrar', async (req, res, next) => {
    try {
      const datos = Registro.parse(req.body);
      const pedido = await pedirCodigoDeRegistro(
        prisma,
        { ...datos, telefonoCrudo: datos.telefono },
        '341',
      );
      return res.json(pedido);
    } catch (error) {
      return next(error);
    }
  });

  /** Paso 2: con el código, queda registrado y adentro. */
  router.post('/cuenta/confirmar', async (req, res, next) => {
    try {
      const datos = RegistroConCodigo.parse(req.body);
      const acceso = await confirmarRegistro(
        prisma,
        { ...datos, telefonoCrudo: datos.telefono },
        '341',
      );
      return res.json({ token: acceso.token, cuenta: await armarCuenta(acceso.clienteId, 30) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/cuenta/ingresar', async (req, res, next) => {
    try {
      const datos = IngresoCliente.parse(req.body);
      const clave = `cliente:${datos.email.trim().toLowerCase()}`;

      const espera = esperaPendiente(clave);
      if (espera > 0) {
        return res.status(429).json({
          error: 'DEMASIADOS_INTENTOS',
          mensaje: `Probá de nuevo en ${espera} segundos.`,
          detalle: { esperaSegundos: espera },
        });
      }

      try {
        const acceso = await ingresarConEmail(prisma, datos.email, datos.contrasena);
        registrarExito(clave);
        return res.json({ token: acceso.token, cuenta: await armarCuenta(acceso.clienteId, 30) });
      } catch (error) {
        registrarFallo(clave);
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  });

  /** Me olvidé la contraseña: el código va al teléfono de la cuenta. */
  router.post('/cuenta/recuperar', async (req, res, next) => {
    try {
      const { email } = Recuperacion.parse(req.body);
      return res.json(await pedirRecuperacion(prisma, email));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/cuenta/restablecer', async (req, res, next) => {
    try {
      const datos = Restablecimiento.parse(req.body);
      const acceso = await restablecerContrasena(
        prisma,
        datos.email,
        datos.codigo,
        datos.contrasena,
      );
      return res.json({ token: acceso.token, cuenta: await armarCuenta(acceso.clienteId, 30) });
    } catch (error) {
      return next(error);
    }
  });

  /** Cambiar la contraseña desde adentro de la app. */
  router.post('/cuenta/contrasena', exigeCliente, async (req, res, next) => {
    try {
      const datos = CambioDeContrasena.parse(req.body);
      await cambiarContrasenaDelCliente(
        prisma,
        res.locals.clienteId,
        datos.contrasenaActual,
        datos.contrasenaNueva,
      );
      return res.json({ cambiada: true });
    } catch (error) {
      return next(error);
    }
  });

  // --- Acceso por código, para quien todavía no se registró (D-022) ---

  router.post('/acceso/pedir', async (req, res, next) => {
    try {
      const { telefono } = Pedido.parse(req.body);
      return res.json(await pedirCodigo(prisma, telefono, '341'));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/acceso/confirmar', async (req, res, next) => {
    try {
      const { telefono, codigo } = Confirmacion.parse(req.body);
      const acceso = await confirmarCodigo(prisma, telefono, codigo, '341');
      const cuenta = await armarCuenta(acceso.clienteId, 30);
      return res.json({ token: acceso.token, cuenta });
    } catch (error) {
      return next(error);
    }
  });

  // --- La cuenta ---

  /** Para la app, que manda el token por cabecera. */
  router.get('/cuenta', exigeCliente, async (_req, res, next) => {
    try {
      return res.json(await armarCuenta(res.locals.clienteId, 50));
    } catch (error) {
      return next(error);
    }
  });

  /** Para el link de WhatsApp, que trae el token en la dirección (D-011). */
  router.get('/saldo/:token', exigeCliente, async (_req, res, next) => {
    try {
      return res.json(await armarCuenta(res.locals.clienteId, 15));
    } catch (error) {
      return next(error);
    }
  });

  // --- Contenido público: no hace falta estar identificado ---

  router.get('/locales', async (_req, res, next) => {
    try {
      const locales = await prisma.local.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true, direccion: true, horarios: true, telefono: true },
      });
      return res.json({ locales });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/novedades', async (_req, res, next) => {
    try {
      const articulos = await prisma.articulo.findMany({
        where: { visibleEnApp: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        take: 60,
      });
      return res.json({
        novedades: articulos.map((a) => ({
          id: a.id,
          titulo: a.nombre,
          detalle: a.detalle,
          precioTexto: formatearPesos(a.precioCentavos),
          lineaDeNegocio: a.lineaDeNegocio,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  /** Cómo funciona el programa, con los valores vigentes. La app lo muestra tal cual. */
  router.get('/programa', async (_req, res, next) => {
    try {
      const { configuracionVigente } = await import('../../servicios/configuracion.js');
      const config = await configuracionVigente(prisma);
      return res.json({
        valorPuntoTexto: formatearPesos(config.valorPuntoCentavos),
        topePorcentaje: config.topeCanjeBps / 100,
        tasas: Object.entries(config.tasas)
          .filter(([linea]) => linea !== 'EGRESADOS')
          .map(([linea, centavos]) => ({
            lineaDeNegocio: linea,
            porPuntoTexto: centavos ? formatearPesos(centavos) : null,
          })),
        venceEn: config.temporada.cierreEn,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
