/**
 * Fechas de calendario del negocio (D-020).
 *
 * El cierre de temporada es una **fecha de calendario argentina**, no un instante
 * cualquiera: "los puntos vencen el 31 de diciembre" significa al final de ese día
 * en Rosario. Guardarla como instante sin fijar la zona hace que al leerla en UTC
 * aparezca como el día siguiente, y cada guardado la corra un día más.
 *
 * Argentina usa UTC-3 fijo, sin horario de verano, así que alcanza con un offset
 * constante. Si algún día volviera el horario de verano, este es el único archivo
 * que hay que tocar.
 */

/** Offset fijo de Argentina. */
export const OFFSET_ARGENTINA = '-03:00';

const FECHA_SIMPLE = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaSimple(texto: string): boolean {
  if (!FECHA_SIMPLE.test(texto)) return false;
  const instante = new Date(`${texto}T00:00:00${OFFSET_ARGENTINA}`);
  return !Number.isNaN(instante.getTime());
}

/**
 * `"2026-12-31"` → el instante del final de ese día en Argentina
 * (`2027-01-01T02:59:59.999Z`). Es lo que se guarda como `Temporada.cierreEn`.
 */
export function finDelDiaArgentina(fecha: string): Date {
  if (!esFechaSimple(fecha)) {
    throw new Error(`Fecha inválida: "${fecha}". Se espera AAAA-MM-DD.`);
  }
  return new Date(`${fecha}T23:59:59.999${OFFSET_ARGENTINA}`);
}

/**
 * Inversa de `finDelDiaArgentina`: el instante guardado → la fecha de calendario
 * argentina que le corresponde (`2027-01-01T02:59:59.999Z` → `"2026-12-31"`).
 *
 * Es lo que ve y edita el panel, así que guardar sin cambiar nada tiene que
 * devolver exactamente la misma fecha.
 */
export function fechaArgentina(instante: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
  // 'en-CA' formatea como AAAA-MM-DD.
  return partes;
}
