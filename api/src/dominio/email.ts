/**
 * El mail con el que el cliente entra a la app (D-036).
 *
 * Ojo con lo que el mail **no** es: no es la identidad de la cuenta. La cuenta
 * sigue siendo el teléfono (D-010) — es lo que el vendedor tipea en el
 * mostrador, lo que recibe el aviso por WhatsApp y lo que ata los puntos a una
 * persona. El mail es un nombre de usuario: una forma cómoda de entrar.
 *
 * Por eso acá no se valida "que el mail exista", que no se puede sin mandarle
 * algo. Se valida que tenga forma de mail y se normaliza para que
 * "Maria@Gmail.com " y "maria@gmail.com" sean el mismo.
 */

/**
 * Deliberadamente permisivo. Un regex estricto de verdad es imposible de
 * escribir y lo único que logra es rechazar mails reales y raros; lo que
 * importa es que no entre cualquier cosa por error de tipeo.
 */
const FORMA_DE_MAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const LARGO_MAXIMO_EMAIL = 254;

/** Minúsculas y sin espacios alrededor. Nada más: los puntos y el "+" se respetan. */
export function normalizarEmail(crudo: string): string {
  return String(crudo ?? '')
    .trim()
    .toLowerCase();
}

/** El motivo por el que no sirve, o `null` si está bien. Se le muestra a la persona. */
export function motivoEmailInvalido(crudo: string): string | null {
  const email = normalizarEmail(crudo);
  if (email.length === 0) return 'Escribí tu mail.';
  if (email.length > LARGO_MAXIMO_EMAIL) return 'Ese mail es demasiado largo.';
  if (!FORMA_DE_MAIL.test(email)) return 'Ese mail no parece estar bien escrito.';
  return null;
}

export function emailValido(crudo: string): boolean {
  return motivoEmailInvalido(crudo) === null;
}
