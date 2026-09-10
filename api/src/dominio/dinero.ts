/**
 * Aritmética de dinero. Todo en centavos, entero, `bigint`. Nunca float (D-002).
 */
import { ErrorDeNegocio } from './tipos.js';

export const CENTAVOS_POR_PESO = 100n;

export function pesosACentavos(pesos: number | string): bigint {
  return parsearImporte(String(pesos));
}

/**
 * Parsea lo que tipea una persona: "25000", "25.000", "25.000,50", "$ 25000,5",
 * "25,000.50". Devuelve centavos.
 *
 * Convención rioplatense por defecto: la coma es decimal y el punto es separador
 * de miles. Si sólo aparece el punto, se decide por la cantidad de dígitos que
 * lo siguen: uno o dos dígitos => decimal ("25.5"); tres => miles ("25.000").
 */
export function parsearImporte(texto: string): bigint {
  const limpio = String(texto).trim().replace(/[\s$]/g, '');
  if (limpio === '') throw new ErrorDeNegocio('IMPORTE_INVALIDO', 'El importe está vacío');

  const negativo = limpio.startsWith('-');
  const cuerpo = negativo ? limpio.slice(1) : limpio;
  if (!/^[\d.,]+$/.test(cuerpo)) {
    throw new ErrorDeNegocio('IMPORTE_INVALIDO', `Importe inválido: "${texto}"`);
  }

  let entero: string;
  let decimales: string;

  const tieneComa = cuerpo.includes(',');
  const tienePunto = cuerpo.includes('.');

  if (tieneComa) {
    // La coma manda como separador decimal; los puntos son de miles.
    const partes = cuerpo.split(',');
    if (partes.length > 2) {
      throw new ErrorDeNegocio('IMPORTE_INVALIDO', `Importe inválido: "${texto}"`);
    }
    entero = (partes[0] ?? '').replace(/\./g, '');
    decimales = partes[1] ?? '';
  } else if (tienePunto) {
    const partes = cuerpo.split('.');
    const ultima = partes[partes.length - 1] ?? '';
    if (partes.length === 2 && ultima.length > 0 && ultima.length <= 2) {
      entero = partes[0] ?? '';
      decimales = ultima;
    } else {
      entero = partes.join('');
      decimales = '';
    }
  } else {
    entero = cuerpo;
    decimales = '';
  }

  if (decimales.length > 2) {
    throw new ErrorDeNegocio('IMPORTE_INVALIDO', 'El importe tiene más de dos decimales');
  }
  if (entero === '' && decimales === '') {
    throw new ErrorDeNegocio('IMPORTE_INVALIDO', `Importe inválido: "${texto}"`);
  }

  const centavos =
    BigInt(entero === '' ? '0' : entero) * CENTAVOS_POR_PESO +
    BigInt(decimales.padEnd(2, '0') || '0');

  return negativo ? -centavos : centavos;
}

/** "$ 25.000,50" para mostrar en pantalla. */
export function formatearPesos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const pesos = abs / CENTAVOS_POR_PESO;
  const resto = abs % CENTAVOS_POR_PESO;
  const enteroConPuntos = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = resto === 0n ? '' : `,${resto.toString().padStart(2, '0')}`;
  return `${negativo ? '-' : ''}$${enteroConPuntos}${decimales}`;
}

/** División entera truncada hacia abajo para bigint no negativos. */
export function dividirEntero(dividendo: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) {
    throw new ErrorDeNegocio('CONFIGURACION_INVALIDA', 'El divisor debe ser positivo');
  }
  return dividendo / divisor;
}

/** Techo de la división entera (para bigint no negativos). */
export function dividirTecho(dividendo: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) {
    throw new ErrorDeNegocio('CONFIGURACION_INVALIDA', 'El divisor debe ser positivo');
  }
  return (dividendo + divisor - 1n) / divisor;
}

/** Porcentaje en puntos básicos (1000 bps = 10%), redondeado hacia abajo. */
export function aplicarBps(centavos: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new ErrorDeNegocio('CONFIGURACION_INVALIDA', 'El tope debe ser un entero en bps');
  }
  return (centavos * BigInt(bps)) / 10_000n;
}
