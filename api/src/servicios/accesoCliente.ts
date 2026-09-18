/**
 * Acceso del cliente a su propia cuenta (D-022).
 *
 * El teléfono es la cuenta (D-010) y no hay contraseña, así que la identidad se
 * prueba mandando un código de un solo uso **a ese mismo teléfono** por WhatsApp.
 * Quien no tiene el celular no entra.
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

const MINUTO = 60_000;

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

  const pedidosRecientes = await prisma.codigoDeAcceso.count({
    where: { telefonoE164, creadoEn: { gte: new Date(Date.now() - 60 * MINUTO) } },
  });
  if (pedidosRecientes >= CODIGOS_POR_HORA) {
    throw new ErrorDeNegocio(
      'DEMASIADOS_PEDIDOS',
      'Pediste el código muchas veces seguidas. Esperá un rato y probá de nuevo.',
    );
  }

  const cliente = await prisma.cliente.findUnique({
    where: { telefonoE164 },
    select: { id: true, nombre: true, fusionadoEnId: true },
  });
  // Sin cuenta no se manda nada, pero la respuesta es idéntica.
  if (!cliente) return respuesta;

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
    nombre: cliente.nombre,
    codigo,
    vigenciaMinutos: VIGENCIA_CODIGO_MIN,
  });

  return respuesta;
}

export type AccesoConcedido = {
  token: string;
  clienteId: string;
  nombre: string;
};

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
  const limpio = String(codigo).replace(/\D/g, '');

  const invalido = new ErrorDeNegocio(
    'CODIGO_INVALIDO',
    'El código no es correcto o ya venció. Pedí uno nuevo.',
  );

  const vigente = await prisma.codigoDeAcceso.findFirst({
    where: { telefonoE164, usadoEn: null, expiraEn: { gt: new Date() } },
    orderBy: { creadoEn: 'desc' },
  });
  if (!vigente || vigente.intentos >= INTENTOS_POR_CODIGO) throw invalido;

  const coincide = await bcrypt.compare(limpio, vigente.codigoHash);
  if (!coincide) {
    await prisma.codigoDeAcceso.update({
      where: { id: vigente.id },
      data: { intentos: vigente.intentos + 1 },
    });
    throw invalido;
  }

  const cliente = await prisma.cliente.findUnique({ where: { telefonoE164 } });
  if (!cliente) throw invalido;

  // Un código sirve una sola vez.
  await prisma.codigoDeAcceso.update({
    where: { id: vigente.id },
    data: { usadoEn: new Date() },
  });

  // Si esta cuenta se fusionó con otra, entra a la que sobrevivió (D-010).
  const id = cliente.fusionadoEnId ?? cliente.id;
  const vigenteCliente = await prisma.cliente.findUniqueOrThrow({ where: { id } });

  return {
    token: firmarTokenCliente(vigenteCliente.id, vigenteCliente.tokenVersion),
    clienteId: vigenteCliente.id,
    nombre: vigenteCliente.nombre,
  };
}

/** Limpieza de códigos vencidos. La corre la tarea programada. */
export async function limpiarCodigosVencidos(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.codigoDeAcceso.deleteMany({
    where: { expiraEn: { lt: new Date(Date.now() - 24 * 60 * MINUTO) } },
  });
  return count;
}
