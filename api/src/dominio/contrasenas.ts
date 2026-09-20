/**
 * Qué se acepta como contraseña del personal (D-034).
 *
 * Es una regla pura a propósito: la usan el alta de personal, el cambio de
 * contraseña y el seed, y las tres tienen que exigir exactamente lo mismo. Si
 * viviera adentro de una ruta, el seed podría crear una contraseña que el panel
 * después rechaza.
 *
 * El criterio es largo antes que raro: una contraseña larga y fácil de recordar
 * es mejor que una corta llena de símbolos que termina escrita en un papel
 * pegado al monitor. Por eso no se piden mayúsculas ni caracteres especiales.
 */

export const LARGO_MINIMO = 8;
/** bcrypt ignora lo que pase de 72 bytes: mejor rechazarlo que hacer de cuenta. */
export const LARGO_MAXIMO = 72;
/** Si son sólo números, pedimos más: seis dígitos es el PIN que estamos sacando. */
export const LARGO_MINIMO_SOLO_NUMEROS = 10;

/** Las de siempre, más las que cualquiera probaría en este negocio. */
const PROHIBIDAS = new Set([
  'contrasena',
  'contraseña',
  'password',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'incollege',
  'puntosincollege',
  'mostrador',
  'vendedor',
  'gerente',
  'rosario',
  'admin123',
  'administrador',
]);

/** Sin acentos ni mayúsculas, para comparar contra la lista. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Devuelve el motivo por el que no sirve, o `null` si está bien.
 * El mensaje se le muestra tal cual a la persona, así que dice qué hacer.
 */
export function motivoContrasenaInvalida(
  contrasena: string,
  opciones: { usuario?: string } = {},
): string | null {
  if (typeof contrasena !== 'string' || contrasena.length === 0) {
    return 'Escribí una contraseña.';
  }
  if (contrasena !== contrasena.trim()) {
    return 'La contraseña no puede empezar ni terminar con un espacio.';
  }
  if (contrasena.length < LARGO_MINIMO) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO} caracteres.`;
  }
  // El largo se mide en bytes: una ñ o una tilde ocupan dos.
  if (Buffer.byteLength(contrasena, 'utf8') > LARGO_MAXIMO) {
    return `La contraseña es demasiado larga (máximo ${LARGO_MAXIMO} caracteres).`;
  }
  if (/^\d+$/.test(contrasena) && contrasena.length < LARGO_MINIMO_SOLO_NUMEROS) {
    return `Si son sólo números tienen que ser al menos ${LARGO_MINIMO_SOLO_NUMEROS}. Mejor todavía: usá palabras.`;
  }
  if (new Set(contrasena).size === 1) {
    return 'La contraseña no puede ser el mismo carácter repetido.';
  }

  const plana = normalizar(contrasena);
  if (PROHIBIDAS.has(plana)) {
    return 'Esa contraseña es de las primeras que alguien probaría. Poné otra.';
  }

  const usuario = opciones.usuario ? normalizar(opciones.usuario) : '';
  if (usuario && (plana === usuario || plana.includes(usuario))) {
    return 'La contraseña no puede contener tu nombre de usuario.';
  }

  return null;
}

export function contrasenaValida(contrasena: string, opciones: { usuario?: string } = {}): boolean {
  return motivoContrasenaInvalida(contrasena, opciones) === null;
}
