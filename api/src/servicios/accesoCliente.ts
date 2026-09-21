/**
 * Acceso del cliente a su propia cuenta con un código de un solo uso (D-022).
 *
 * Es el camino de siempre y el que sigue probando la identidad: el teléfono es
 * la cuenta (D-010), así que mandar el código **a ese mismo teléfono** por
 * WhatsApp es lo que demuestra que la cuenta es suya. Quien no tiene el celular
 * no entra.
 *
 * Desde D-036 este no es el único camino: el cliente también puede registrarse
 * y entrar con su mail y su contraseña (ver `cuentaCliente.ts`). Pero el código
 * sigue siendo la base: registrarse lo pide, y recuperar la contraseña también.
 *
 * Defensas, todas acá y no repartidas por las rutas:
 *  - el código se guarda hasheado: no se puede leer ni desde la base;
 *  - vence a los 10 minutos y admite 5 intentos;
 *  - al usarse queda inutilizable;
 *  - hay un tope de códigos por teléfono por hora;
 *  - `pedirCodigo` devuelve siempre lo mismo exista o no el cliente, así nadie
 *    puede averiguar quién es cliente probando números.
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { normalizarTelefono, formatearTelefono } from '../dominio/telefono.js';
import { ErrorDeNegocio } from '../dominio/tipos.js';
import { encolarEvento } from './avisos.js';
import { firmarTokenCliente } from './tokenCliente.js';

export const MINUTO = 60_000;

export const VIGENCIA_CODIGO_MIN = 10;
export const INTENTOS_POR_CODIGO = 5;
/** Códigos que se pueden pedir para el mismo teléfono en una hora. */
export const CODIGOS_POR_HORA = 5;

/** Seis dígitos, aleatorio criptográfico. Nunca `Math.random` para esto. */
function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export type PedidoDeAcceso = {
  /** Siempre true: no se revela si el teléfono tiene cuenta. */
  enviado: true;
  telefonoE164: string;
  /** Sólo para mostrar en pantalla: "+54 9 341 555-1234". */
  telefonoLindo: string;
  vigenciaMinutos: number;
};

export type AccesoConcedido = {
  token: string;
  clienteId: string;
  nombre: string;
};

// --- Piezas compartidas con el registro y la recuperación (D-036) ---

/** Un bcrypt con forma válida que no coincide con ninguna contraseña. */
export const HASH_QUE_NUNCA_COINCIDE =
  '$2a$10$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinva';

export async function exigirCupoDeCodigos(
  prisma: PrismaClient,
  telefonoE164: string,
): Promise<void> {
  const recientes = await prisma.codigoDeAcceso.count({
    where: { telefonoE164, creadoEn: { gte: new Date(Date.now() - 60 * MINUTO) } },
  });
  if (recientes >= CODIGOS_POR_HORA) {
    throw new ErrorDeNegocio(
      'DEMASIADOS_PEDIDOS',
      'Pediste el código muchas veces seguidas. Esperá un rato y probá de nuevo.',
    );
  }
}

/**
 * Genera el código, lo guarda hasheado y encola el aviso.
 *
 * Usa el evento `acceso.codigo` para todo —acceso, registro y recuperación— a
 * propósito: el workflow de n8n ya sabe armar ese mensaje, y el texto que le
 * llega a la persona es el mismo en los tres casos ("tu código es…").
 */
export async function emitirCodigo(
  prisma: PrismaClient,
  telefonoE164: string,
  nombre: string,
): Promise<void> {
  const codigo = generarCodigo();
  await prisma.codigoDeAcceso.create({
    data: {
      telefonoE164,
      codigoHash: await bcrypt.hash(codigo, 10),
      expiraEn: new Date(Date.now() + VIGENCIA_CODIGO_MIN * MINUTO),
    },
  });
  await encolarEvento(prisma, 'acceso.codigo', {
    telefono: telefonoE164,
    nombre,
    codigo,
    vigenciaMinutos: VIGENCIA_CODIGO_MIN,
  });
}

/** Valida el código vigente de ese teléfono y lo deja usado. Tira si no sirve. */
export async function consumirCodigo(
  prisma: PrismaClient,
  telefonoE164: string,
  codigoCrudo: string,
): Promise<void> {
  const limpio = String(codigoCrudo).replace(/\D/g, '');
  const invalido = new ErrorDeNegocio(
    'CODIGO_INVALIDO',
    'El código no es correcto o ya venció. Pedí uno nuevo.',
  );

  const vigente = await prisma.codigoDeAcceso.findFirst({
    where: { telefonoE164, usadoEn: null, expiraEn: { gt: new Date() } },
    orderBy: { creadoEn: 'desc' },
  });
  if (!vigente || vigente.intentos >= INTENTOS_POR_CODIGO) throw invalido;

  if (!(await bcrypt.compare(limpio, vigente.codigoHash))) {
    await prisma.codigoDeAcceso.update({
      where: { id: vigente.id },
      data: { intentos: vigente.intentos + 1 },
    });
    throw invalido;
  }

  // Un código sirve una sola vez.
  await prisma.codigoDeAcceso.update({
    where: { id: vigente.id },
    data: { usadoEn: new Date() },
  });
}

/** El cliente vigente de una cuenta, siguiendo la fusión si la hubo (D-010). */
export async function accesoPara(
  prisma: PrismaClient,
  clienteId: string,
  fusionadoEnId: string | null,
): Promise<AccesoConcedido> {
  const vigente = await prisma.cliente.findUniqueOrThrow({
    where: { id: fusionadoEnId ?? clienteId },
  });
  return {
    token: firmarTokenCliente(vigente.id, vigente.tokenVersion),
    clienteId: vigente.id,
    nombre: vigente.nombre,
  };
}

// --- Acceso por código (D-022) ---

/**
 * Genera y encola el código. Si el teléfono no tiene cuenta no manda nada, pero
 * responde igual: el cliente ve la misma pantalla en los dos casos.
 */
export async function pedirCodigo(
  prisma: PrismaClient,
  telefonoCrudo: string,
  areaPorDefecto?: string,
): Promise<PedidoDeAcceso> {
  const telefonoE164 = normalizarTelefono(telefonoCrudo, { areaPorDefecto });
  const respuesta: PedidoDeAcceso = {
    enviado: true,
    telefonoE164,
    telefonoLindo: formatearTelefono(telefonoE164),
    vigenciaMinutos: VIGENCIA_CODIGO_MIN,
  };

  await exigirCupoDeCodigos(prisma, telefonoE164);

  const cliente = await prisma.cliente.findUnique({
    where: { telefonoE164 },
    select: { id: true, nombre: true, fusionadoEnId: true },
  });
  // Sin cuenta no se manda nada, pero la respuesta es idéntica.
  if (!cliente) return respuesta;

  await emitirCodigo(prisma, telefonoE164, cliente.nombre);
  return respuesta;
}

/**
 * Valida el código y devuelve el token de cliente (D-011), el mismo que usa el
 * link de WhatsApp. La app lo guarda y entra sin volver a pedir nada.
 */
export async function confirmarCodigo(
  prisma: PrismaClient,
  telefonoCrudo: string,
  codigo: string,
  areaPorDefecto?: string,
): Promise<AccesoConcedido> {
  const telefonoE164 = normalizarTelefono(telefonoCrudo, { areaPorDefecto });

  const cliente = await prisma.cliente.findUnique({ where: { telefonoE164 } });
  if (!cliente) {
    throw new ErrorDeNegocio(
      'CODIGO_INVALIDO',
      'El código no es correcto o ya venció. Pedí uno nuevo.',
    );
  }

  await consumirCodigo(prisma, telefonoE164, codigo);
  return accesoPara(prisma, cliente.id, cliente.fusionadoEnId);
}

/** Limpieza de códigos vencidos. La corre la tarea programada. */
export async function limpiarCodigosVencidos(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.codigoDeAcceso.deleteMany({
    where: { expiraEn: { lt: new Date(Date.now() - 24 * 60 * MINUTO) } },
  });
  return count;
}
