/**
 * Normalización de teléfonos a E.164 (D-010).
 *
 * La gente carga el número a mano en el mostrador, de todas las formas posibles:
 * con y sin 0 de larga distancia, con y sin 15, con guiones, puntos, espacios,
 * paréntesis, con y sin código de país. Dos formatos del mismo número tienen que
 * resolver a la misma cuenta.
 *
 * Se asume celular (WhatsApp): el resultado argentino siempre lleva el 9 de móvil.
 */
import { ErrorDeNegocio } from './tipos.js';

/** Códigos de área argentinos. Los de los locales primero; el resto, los usuales. */
const AREAS_2 = ['11'];
const AREAS_3 = [
  '341', // Rosario
  '342', // Santa Fe capital
  '336', // San Nicolás
  '351', '221', '223', '261', '264', '266', '280', '291', '297', '299',
  '343', '345', '348', '353', '358', '362', '364', '370', '376', '379',
  '380', '381', '383', '385', '387', '388',
];
const AREAS_4 = [
  '3401', '3402', '3404', '3405', '3406', '3408', '3409', '3435', '3436',
  '3442', '3444', '3446', '3447', '3455', '3460', '3462', '3463', '3464',
  '3465', '3466', '3467', '3469', '3471', '3476', '3482', '3487', '3491',
  '3492', '3493', '3496', '3497', '3498', '2202', '2226', '2227', '2229',
  '2241', '2242', '2243', '2244', '2245', '2246', '2252', '2254', '2255',
  '2257', '2261', '2262', '2264', '2266', '2267', '2268', '2271', '2272',
  '2273', '2274', '2281', '2283', '2284', '2285', '2286', '2291', '2292',
  '2293', '2296', '2297', '2314', '2317', '2320', '2323', '2324', '2325',
  '2326', '2331', '2333', '2335', '2337', '2338', '2342', '2343', '2344',
  '2345', '2346', '2352', '2353', '2354', '2355', '2356', '2357', '2358',
];

/** Largo del número nacional significativo argentino: área + abonado. */
const LARGO_NACIONAL_AR = 10;

export type OpcionesTelefono = {
  /** Código de área que se asume cuando la persona tipea sólo el abonado. */
  areaPorDefecto?: string;
};

export function esTelefonoValido(crudo: string, opciones: OpcionesTelefono = {}): boolean {
  try {
    normalizarTelefono(crudo, opciones);
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el número en E.164 (`+5493415551234`) o tira `ErrorDeNegocio`.
 */
export function normalizarTelefono(crudo: string, opciones: OpcionesTelefono = {}): string {
  if (typeof crudo !== 'string' || crudo.trim() === '') {
    throw new ErrorDeNegocio('TELEFONO_INVALIDO', 'Falta el teléfono');
  }

  let texto = crudo.trim();
  // "00 54 ..." es el prefijo internacional a la vieja usanza.
  if (texto.startsWith('00')) texto = `+${texto.slice(2)}`;
  const tieneMas = texto.startsWith('+');

  let digitos = texto.replace(/\D/g, '');
  if (digitos === '') {
    throw new ErrorDeNegocio('TELEFONO_INVALIDO', `Teléfono inválido: "${crudo}"`);
  }

  // Número internacional que no es argentino: se guarda tal cual.
  if (tieneMas && !digitos.startsWith('54')) {
    if (digitos.length < 8 || digitos.length > 15) {
      throw new ErrorDeNegocio('TELEFONO_INVALIDO', `Teléfono inválido: "${crudo}"`);
    }
    return `+${digitos}`;
  }

  // Sacar el código de país argentino si vino.
  if (digitos.startsWith('54') && (tieneMas || digitos.length >= 12)) {
    digitos = digitos.slice(2);
  }

  // Sacar el 0 de larga distancia.
  while (digitos.startsWith('0')) digitos = digitos.slice(1);

  // Sacar el 9 de móvil si vino adelante (+54 9 341 ...).
  if (digitos.length === LARGO_NACIONAL_AR + 1 && digitos.startsWith('9')) {
    digitos = digitos.slice(1);
  }

  // "15 555 1234" sin área: el 15 va pegado al abonado.
  if (digitos.startsWith('15') && digitos.length - 2 >= 6 && digitos.length - 2 <= 8) {
    digitos = digitos.slice(2);
  }

  // Sólo el abonado: se completa con el área del local.
  if (digitos.length >= 6 && digitos.length <= 8) {
    const area = (opciones.areaPorDefecto ?? '').replace(/\D/g, '');
    if (area === '') {
      throw new ErrorDeNegocio(
        'TELEFONO_SIN_AREA',
        `Falta el código de área en "${crudo}"`,
      );
    }
    digitos = area + digitos;
  }

  // Sacar el 15 que va después del código de área.
  const area = detectarArea(digitos);
  if (area) {
    const resto = digitos.slice(area.length);
    if (resto.startsWith('15') && area.length + resto.length - 2 === LARGO_NACIONAL_AR) {
      digitos = area + resto.slice(2);
    }
  }

  if (digitos.length !== LARGO_NACIONAL_AR) {
    throw new ErrorDeNegocio(
      'TELEFONO_INVALIDO',
      `Teléfono inválido: "${crudo}" (quedaron ${digitos.length} dígitos, se esperaban ${LARGO_NACIONAL_AR})`,
    );
  }

  return `+549${digitos}`;
}

/** Detecta el código de área al principio del número nacional. */
export function detectarArea(nacional: string): string | null {
  for (const area of AREAS_4) if (nacional.startsWith(area)) return area;
  for (const area of AREAS_3) if (nacional.startsWith(area)) return area;
  for (const area of AREAS_2) if (nacional.startsWith(area)) return area;
  return null;
}

/** "+54 9 341 555-1234" para mostrar. */
export function formatearTelefono(e164: string): string {
  if (!e164.startsWith('+549')) return e164;
  const nacional = e164.slice(4);
  const area = detectarArea(nacional);
  if (!area) return e164;
  const abonado = nacional.slice(area.length);
  const corte = abonado.length - 4;
  return `+54 9 ${area} ${abonado.slice(0, corte)}-${abonado.slice(corte)}`;
}
