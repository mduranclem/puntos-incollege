/**
 * Clientes y cuentas de puntos.
 *
 * La identidad es el teléfono normalizado a E.164 (D-010). Si dos cuentas
 * resultan ser la misma persona, se fusionan reasignando el libro mayor; la
 * absorbida queda apuntando a la sobreviviente y nunca se borra (D-004).
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import { formatearTelefono, normalizarTelefono } from '../dominio/telefono.js';
import { ErrorDeNegocio } from '../dominio/tipos.js';
import { temporadaVigente } from './configuracion.js';

/** Quien puede recibir un cobro: existe y tiene cuenta en la app (D-060). */
export type ClienteConCuenta = {
  id: string;
  nombre: string;
  telefonoE164: string;
  registradoEn: Date;
};

/** Sigue la cadena de fusiones hasta la cuenta sobreviviente. */
async function resolverFusion(prisma: PrismaClient, clienteId: string): Promise<string> {
  let actual = clienteId;
  for (let i = 0; i < 10; i++) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: actual },
      select: { fusionadoEnId: true },
    });
    if (!cliente?.fusionadoEnId) return actual;
    actual = cliente.fusionadoEnId;
  }
  throw new ErrorDeNegocio('FUSION_CIRCULAR', 'La cadena de fusiones es demasiado larga');
}

export async function buscarClientePorTelefono(
  prisma: PrismaClient,
  telefonoCrudo: string,
  areaPorDefecto?: string,
) {
  const telefonoE164 = normalizarTelefono(telefonoCrudo, { areaPorDefecto });
  const encontrado = await prisma.cliente.findUnique({ where: { telefonoE164 } });
  if (!encontrado) return null;
  const id = await resolverFusion(prisma, encontrado.id);
  return id === encontrado.id
    ? encontrado
    : await prisma.cliente.findUnique({ where: { id } });
}

/**
 * El cliente de ese teléfono, **sólo si tiene cuenta en la app** (D-060).
 *
 * No crea nada. Antes el mostrador abría la ficha al cobrar, y de ahí salían
 * clientes que nunca habían pedido estar en el programa; ahora la ficha la crea
 * la persona al registrarse y acá solamente se busca.
 *
 * Devuelve `null` en los tres casos que para el mostrador son el mismo —no se
 * puede cobrar—: el teléfono no existe, existe pero sin cuenta (una ficha vieja
 * de las que abría el mostrador), o está fusionado en otra que tampoco se
 * registró.
 */
export async function clienteConCuenta(
  prisma: PrismaClient,
  datos: { telefonoCrudo: string; areaPorDefecto?: string },
): Promise<ClienteConCuenta | null> {
  const cliente = await buscarClientePorTelefono(
    prisma,
    datos.telefonoCrudo,
    datos.areaPorDefecto,
  );
  if (!cliente?.registradoEn) return null;
  return {
    id: cliente.id,
    nombre: cliente.nombre,
    telefonoE164: cliente.telefonoE164,
    registradoEn: cliente.registradoEn,
  };
}

/** Cuenta de la temporada abierta. La crea si es la primera operación del cliente. */
export async function cuentaVigente(prisma: PrismaClient, clienteId: string) {
  const temporada = await temporadaVigente(prisma);
  const existente = await prisma.cuentaPuntos.findUnique({
    where: { clienteId_temporadaId: { clienteId, temporadaId: temporada.id } },
  });
  if (existente) return existente;
  try {
    return await prisma.cuentaPuntos.create({
      data: { clienteId, temporadaId: temporada.id },
    });
  } catch (error) {
    // Carrera con otra caja creando la misma cuenta: la releemos.
    if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
      return prisma.cuentaPuntos.findUniqueOrThrow({
        where: { clienteId_temporadaId: { clienteId, temporadaId: temporada.id } },
      });
    }
    throw error;
  }
}

/**
 * Candidatos a duplicado: clientes distintos cuyo teléfono normalizado coincide
 * salvo por el 9 de móvil, o que comparten documento.
 */
export async function buscarDuplicados(prisma: PrismaClient, limite = 50) {
  const clientes = await prisma.cliente.findMany({
    where: { fusionadoEnId: null },
    select: { id: true, nombre: true, telefonoE164: true, documento: true, creadoEn: true },
  });

  const porClave = new Map<string, typeof clientes>();
  for (const cliente of clientes) {
    // Clave laxa: últimos 8 dígitos del teléfono. Detecta el 9/15 mal cargado.
    const clave = cliente.telefonoE164.replace(/\D/g, '').slice(-8);
    const grupo = porClave.get(clave) ?? [];
    grupo.push(cliente);
    porClave.set(clave, grupo);
  }

  const grupos = [...porClave.values()].filter((g) => g.length > 1).slice(0, limite);
  return grupos.map((grupo) => ({
    clave: grupo[0]!.telefonoE164.replace(/\D/g, '').slice(-8),
    clientes: grupo,
  }));
}

/**
 * Fusiona `absorbidoId` dentro de `sobrevivienteId`: mueve los movimientos de las
 * cuentas de la misma temporada, recalcula la caché y marca el absorbido.
 * No borra nada (D-004).
 */
export async function fusionarClientes(
  prisma: PrismaClient,
  sobrevivienteId: string,
  absorbidoId: string,
  usuarioId: string | null,
) {
  if (sobrevivienteId === absorbidoId) {
    throw new ErrorDeNegocio('FUSION_INVALIDA', 'No se puede fusionar un cliente consigo mismo');
  }

  return prisma.$transaction(async (tx) => {
    const [sobreviviente, absorbido] = await Promise.all([
      tx.cliente.findUniqueOrThrow({ where: { id: sobrevivienteId }, include: { cuentas: true } }),
      tx.cliente.findUniqueOrThrow({ where: { id: absorbidoId }, include: { cuentas: true } }),
    ]);
    if (absorbido.fusionadoEnId) {
      throw new ErrorDeNegocio('FUSION_INVALIDA', 'Ese cliente ya fue fusionado');
    }

    for (const cuentaOrigen of absorbido.cuentas) {
      let destino = sobreviviente.cuentas.find((c) => c.temporadaId === cuentaOrigen.temporadaId);
      if (!destino) {
        destino = await tx.cuentaPuntos.create({
          data: { clienteId: sobrevivienteId, temporadaId: cuentaOrigen.temporadaId },
        });
      }
      await tx.movimiento.updateMany({
        where: { cuentaId: cuentaOrigen.id },
        data: { cuentaId: destino.id },
      });
      await tx.cuentaPuntos.update({
        where: { id: cuentaOrigen.id },
        data: { saldoCacheado: 0, remanenteCentavos: 0n, cacheActualizadoEn: new Date() },
      });

      // Recalcular la caché del destino desde el libro mayor (D-004).
      const suma = await tx.movimiento.aggregate({
        where: { cuentaId: destino.id },
        _sum: { puntos: true },
      });
      const ultimo = await tx.movimiento.findFirst({
        where: { cuentaId: destino.id },
        orderBy: { secuencia: 'desc' },
        select: { remanenteResultanteCentavos: true },
      });
      await tx.cuentaPuntos.update({
        where: { id: destino.id },
        data: {
          saldoCacheado: suma._sum.puntos ?? 0,
          remanenteCentavos: ultimo?.remanenteResultanteCentavos ?? 0n,
          cacheActualizadoEn: new Date(),
        },
      });
    }

    await tx.pago.updateMany({
      where: { clienteId: absorbidoId },
      data: { clienteId: sobrevivienteId },
    });

    const actualizado = await tx.cliente.update({
      where: { id: absorbidoId },
      data: { fusionadoEnId: sobrevivienteId },
    });

    // Si el sobreviviente no tenía nombre y el absorbido sí, se conserva el dato.
    if (
      (!sobreviviente.nombre || sobreviviente.nombre === 'Sin nombre') &&
      absorbido.nombre &&
      absorbido.nombre !== 'Sin nombre'
    ) {
      await tx.cliente.update({
        where: { id: sobrevivienteId },
        data: { nombre: absorbido.nombre },
      });
    }

    return { sobrevivienteId, absorbidoId: actualizado.id, usuarioId };
  });
}

/**
 * Búsqueda rápida para el mostrador (D-023).
 *
 * Dictar diez dígitos con gente esperando es lento y se carga mal. Acá el
 * vendedor tipea lo que tenga a mano y el sistema decide cómo buscar:
 *  - 3 a 7 dígitos → los últimos dígitos del teléfono ("los últimos cuatro"),
 *  - letras → el nombre,
 *  - 8 o más dígitos → lo resuelve la búsqueda exacta de siempre.
 *
 * Nunca devuelve una lista larga: si hay muchas coincidencias, el vendedor
 * tipea un dígito más y listo.
 */
export type Coincidencia = {
  id: string;
  nombre: string;
  telefono: string;
  telefonoE164: string;
  saldoPuntos: number;
};

export const MINIMO_PARA_BUSCAR = 3;
export const MAXIMO_COINCIDENCIAS = 8;

export async function buscarCoincidencias(
  prisma: PrismaClient,
  consulta: string,
): Promise<Coincidencia[]> {
  const texto = consulta.trim();
  if (texto.length < 2) return [];

  const digitos = texto.replace(/\D/g, '');
  const tieneLetras = /[a-záéíóúñü]/i.test(texto);

  const donde = tieneLetras
    ? { nombre: { contains: texto, mode: 'insensitive' as const } }
    : digitos.length >= MINIMO_PARA_BUSCAR
      ? { telefonoE164: { contains: digitos } }
      : null;
  if (!donde) return [];

  const temporada = await temporadaVigente(prisma);
  const clientes = await prisma.cliente.findMany({
    where: { fusionadoEnId: null, ...donde },
    orderBy: { nombre: 'asc' },
    take: MAXIMO_COINCIDENCIAS,
    select: {
      id: true,
      nombre: true,
      telefonoE164: true,
      cuentas: {
        where: { temporadaId: temporada.id },
        select: { saldoCacheado: true },
      },
    },
  });

  return clientes
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefonoE164: c.telefonoE164,
      telefono: formatearTelefono(c.telefonoE164),
      saldoPuntos: c.cuentas[0]?.saldoCacheado ?? 0,
    }))
    // Si el vendedor tipeó los últimos dígitos, esos van primero.
    .sort((a, b) => {
      const aTermina = a.telefonoE164.endsWith(digitos) ? 0 : 1;
      const bTermina = b.telefonoE164.endsWith(digitos) ? 0 : 1;
      return aTermina - bTermina || a.nombre.localeCompare(b.nombre, 'es');
    });
}
