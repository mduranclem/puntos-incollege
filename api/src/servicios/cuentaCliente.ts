/**
 * La cuenta propia del cliente en la app: mail y contraseña (D-036).
 *
 * Es lo que la gente espera de una app de fidelización —la de la estación de
 * servicio funciona así— y se acuerda mejor de su mail que de esperar un código
 * cada vez.
 *
 * **Lo que no cambia: la cuenta sigue siendo el teléfono** (D-010). El mail es
 * un nombre de usuario. El teléfono es lo que el vendedor tipea en el
 * mostrador, lo que recibe los avisos y lo que ata los puntos a una persona.
 *
 * De ahí sale la regla que parece un rodeo y no lo es: **registrarse igual pide
 * el código por WhatsApp**. Los puntos valen plata. Si alcanzara con escribir un
 * teléfono y una contraseña, cualquiera pondría el número de otro y se quedaría
 * con sus puntos. El código, una sola vez, prueba que el teléfono es suyo; de
 * ahí en adelante entra con mail y contraseña y no ve un código nunca más.
 *
 * El mail no se verifica: no hay servidor de correo, y no hace falta. Lo que
 * hay que probar es el teléfono. Alguien que se registre con un mail ajeno sólo
 * se perjudica a sí mismo, porque no va a poder recuperar la contraseña.
 */
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { normalizarTelefono, formatearTelefono } from '../dominio/telefono.js';
import { ErrorDeNegocio } from '../dominio/tipos.js';
import { motivoEmailInvalido, normalizarEmail } from '../dominio/email.js';
import { motivoContrasenaInvalida } from '../dominio/contrasenas.js';
import { firmarTokenCliente } from './tokenCliente.js';
import {
  HASH_QUE_NUNCA_COINCIDE,
  VIGENCIA_CODIGO_MIN,
  accesoPara,
  consumirCodigo,
  emitirCodigo,
  exigirCupoDeCodigos,
  type AccesoConcedido,
  type PedidoDeAcceso,
} from './accesoCliente.js';

/** Lo que junta la pantalla de registro y vuelve a mandar al confirmar. */
export type DatosDeRegistro = {
  nombre?: string;
  email: string;
  contrasena: string;
  telefonoCrudo: string;
};

function validarDatos(datos: DatosDeRegistro): { email: string } {
  const email = normalizarEmail(datos.email);
  const motivoEmail = motivoEmailInvalido(email);
  if (motivoEmail) throw new ErrorDeNegocio('EMAIL_INVALIDO', motivoEmail);

  const motivoClave = motivoContrasenaInvalida(datos.contrasena);
  if (motivoClave) throw new ErrorDeNegocio('CONTRASENA_DEBIL', motivoClave);

  return { email };
}

/**
 * Nadie se registra encima de una cuenta ajena.
 *
 * El caso normal es que el teléfono **ya tenga** cuenta, porque el mostrador se
 * la abrió al cobrarle: eso está bien y es lo que se quiere, ahí se le agrega
 * el mail. Lo que se frena es registrarse sobre una cuenta que ya tiene dueño
 * en la app.
 */
async function verificarQueSePuedeRegistrar(
  prisma: PrismaClient,
  email: string,
  telefonoE164: string,
): Promise<void> {
  const conEseMail = await prisma.cliente.findUnique({ where: { email } });
  if (conEseMail && conEseMail.telefonoE164 !== telefonoE164) {
    throw new ErrorDeNegocio(
      'EMAIL_EN_USO',
      'Ese mail ya está usado por otra cuenta. Entrá con él, o recuperá la contraseña.',
    );
  }

  const conEseTelefono = await prisma.cliente.findUnique({ where: { telefonoE164 } });
  if (conEseTelefono?.contrasenaHash) {
    throw new ErrorDeNegocio(
      'TELEFONO_YA_REGISTRADO',
      'Ese teléfono ya tiene cuenta en la app. Entrá con tu mail, o recuperá la contraseña.',
    );
  }
}

/**
 * Paso 1 del registro: manda el código al teléfono que se quiere registrar.
 *
 * A diferencia de `pedirCodigo`, acá **sí** manda aunque el teléfono todavía no
 * tenga cuenta: es justamente el caso de alguien que se entera del programa y
 * se registra antes de comprar. El tope de códigos por hora sigue valiendo, que
 * es lo que evita que esto sirva para molestar a un número ajeno.
 */
export async function pedirCodigoDeRegistro(
  prisma: PrismaClient,
  datos: DatosDeRegistro,
  areaPorDefecto?: string,
): Promise<PedidoDeAcceso> {
  const { email } = validarDatos(datos);
  const telefonoE164 = normalizarTelefono(datos.telefonoCrudo, { areaPorDefecto });

  await verificarQueSePuedeRegistrar(prisma, email, telefonoE164);
  await exigirCupoDeCodigos(prisma, telefonoE164);

  const cliente = await prisma.cliente.findUnique({
    where: { telefonoE164 },
    select: { nombre: true },
  });
  await emitirCodigo(prisma, telefonoE164, cliente?.nombre ?? (datos.nombre ?? '').trim());

  return {
    enviado: true,
    telefonoE164,
    telefonoLindo: formatearTelefono(telefonoE164),
    vigenciaMinutos: VIGENCIA_CODIGO_MIN,
  };
}

/**
 * Paso 2: valida el código y deja la cuenta registrada.
 *
 * Si el teléfono ya tenía cuenta —porque el mostrador le cobró antes— se le
 * agregan el mail y la contraseña a **esa** cuenta: no se crea una nueva y no
 * se pierde un solo punto. Es el caso más común de todos.
 */
export async function confirmarRegistro(
  prisma: PrismaClient,
  datos: DatosDeRegistro & { codigo: string },
  areaPorDefecto?: string,
): Promise<AccesoConcedido> {
  const { email } = validarDatos(datos);
  const telefonoE164 = normalizarTelefono(datos.telefonoCrudo, { areaPorDefecto });

  await verificarQueSePuedeRegistrar(prisma, email, telefonoE164);
  await consumirCodigo(prisma, telefonoE164, datos.codigo);

  const contrasenaHash = await bcrypt.hash(datos.contrasena, 10);
  const nombre = (datos.nombre ?? '').trim();
  const existente = await prisma.cliente.findUnique({ where: { telefonoE164 } });

  const cliente = existente
    ? await prisma.cliente.update({
        where: { id: existente.id },
        data: {
          email,
          contrasenaHash,
          registradoEn: new Date(),
          // El nombre que cargó el mostrador manda; sólo se completa si faltaba.
          ...(existente.nombre.trim().length === 0 && nombre ? { nombre } : {}),
        },
      })
    : await prisma.cliente.create({
        data: {
          telefonoE164,
          telefonoCrudo: datos.telefonoCrudo,
          nombre: nombre || 'Cliente',
          email,
          contrasenaHash,
          registradoEn: new Date(),
        },
      });

  return accesoPara(prisma, cliente.id, cliente.fusionadoEnId);
}

/** Entrar con mail y contraseña. Es lo que va a usar el cliente todos los días. */
export async function ingresarConEmail(
  prisma: PrismaClient,
  emailCrudo: string,
  contrasena: string,
): Promise<AccesoConcedido> {
  const email = normalizarEmail(emailCrudo);

  // El mismo mensaje exista o no el mail: probando mails nadie averigua quién
  // es cliente de la casa.
  const invalido = new ErrorDeNegocio('CREDENCIALES', 'El mail o la contraseña no son correctos');

  const cliente = await prisma.cliente.findUnique({ where: { email } });
  // Se compara siempre, para que el tiempo de respuesta no delate nada.
  const coincide = await bcrypt.compare(
    contrasena,
    cliente?.contrasenaHash ?? HASH_QUE_NUNCA_COINCIDE,
  );
  if (!cliente?.contrasenaHash || !coincide) throw invalido;

  return accesoPara(prisma, cliente.id, cliente.fusionadoEnId);
}

/**
 * "Me olvidé la contraseña": el código va por WhatsApp al teléfono de la
 * cuenta, no al mail.
 *
 * Es a propósito y no es sólo porque no haya servidor de correo. El teléfono es
 * la cuenta: mandando el reseteo ahí, ni siquiera alguien que entró al mail del
 * cliente puede quedarse con sus puntos.
 */
export async function pedirRecuperacion(
  prisma: PrismaClient,
  emailCrudo: string,
): Promise<{ enviado: true; vigenciaMinutos: number }> {
  const email = normalizarEmail(emailCrudo);
  const cliente = await prisma.cliente.findUnique({ where: { email } });

  // La respuesta es **idéntica** exista o no la cuenta, igual que en el acceso
  // por código (D-022). Ni siquiera se devuelve el teléfono enmascarado: con
  // eso solo, alguien podría ir probando mails y averiguar quién le compra a la
  // casa. La persona ya sabe cuál es su teléfono; el que no lo sabe, no tiene
  // por qué enterarse de nada.
  if (!cliente?.contrasenaHash) {
    return { enviado: true, vigenciaMinutos: VIGENCIA_CODIGO_MIN };
  }

  await exigirCupoDeCodigos(prisma, cliente.telefonoE164);
  await emitirCodigo(prisma, cliente.telefonoE164, cliente.nombre);

  return { enviado: true, vigenciaMinutos: VIGENCIA_CODIGO_MIN };
}

/** Pone la contraseña nueva con el código que llegó por WhatsApp. */
export async function restablecerContrasena(
  prisma: PrismaClient,
  emailCrudo: string,
  codigo: string,
  contrasenaNueva: string,
): Promise<AccesoConcedido> {
  const email = normalizarEmail(emailCrudo);
  const motivo = motivoContrasenaInvalida(contrasenaNueva);
  if (motivo) throw new ErrorDeNegocio('CONTRASENA_DEBIL', motivo);

  const cliente = await prisma.cliente.findUnique({ where: { email } });
  if (!cliente?.contrasenaHash) {
    throw new ErrorDeNegocio(
      'CODIGO_INVALIDO',
      'El código no es correcto o ya venció. Pedí uno nuevo.',
    );
  }

  await consumirCodigo(prisma, cliente.telefonoE164, codigo);

  const actualizado = await prisma.cliente.update({
    where: { id: cliente.id },
    data: {
      contrasenaHash: await bcrypt.hash(contrasenaNueva, 10),
      // Se caen los links de saldo ya emitidos: si alguien más los tenía, se
      // terminó ahí (D-011).
      tokenVersion: { increment: 1 },
    },
  });

  return {
    token: firmarTokenCliente(actualizado.id, actualizado.tokenVersion),
    clienteId: actualizado.id,
    nombre: actualizado.nombre,
  };
}

/**
 * Cambio de contraseña desde adentro de la app, con la actual.
 * No sube `tokenVersion`: la persona sigue usando la app donde está.
 */
export async function cambiarContrasenaDelCliente(
  prisma: PrismaClient,
  clienteId: string,
  actual: string,
  nueva: string,
): Promise<void> {
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } });
  if (!cliente.contrasenaHash) {
    throw new ErrorDeNegocio(
      'SIN_CUENTA',
      'Todavía no tenés contraseña. Registrate para poder entrar con tu mail.',
    );
  }
  if (!(await bcrypt.compare(actual, cliente.contrasenaHash))) {
    throw new ErrorDeNegocio('CONTRASENA_ACTUAL', 'La contraseña actual no es correcta');
  }
  const motivo = motivoContrasenaInvalida(nueva);
  if (motivo) throw new ErrorDeNegocio('CONTRASENA_DEBIL', motivo);

  await prisma.cliente.update({
    where: { id: cliente.id },
    data: { contrasenaHash: await bcrypt.hash(nueva, 10) },
  });
}
