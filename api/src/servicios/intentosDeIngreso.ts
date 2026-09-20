/**
 * Freno a los intentos de ingreso del personal (D-034).
 *
 * Con PIN de seis dígitos esto era imprescindible: un millón de combinaciones se
 * prueban en minutos. Con contraseñas sigue haciendo falta, porque el usuario de
 * mostrador es público (`mostrador-fisherton` no es un secreto) y lo único que
 * protege la caja es la contraseña.
 *
 * **Espera, no bloqueo.** La diferencia importa: esto corre en un local con
 * gente esperando para pagar. Un bloqueo de "quince minutos" por cinco errores
 * de tipeo deja al vendedor sin poder cobrar y el problema pasa a ser nuestro.
 * Acá la espera crece pero tiene techo de un minuto, así que el peor caso es
 * "esperá un minuto", nunca "volvé mañana".
 *
 * Vive en memoria y se pierde al reiniciar. Alcanza: es un solo proceso (D-032)
 * y lo que frena es la velocidad, no la cantidad total de intentos.
 */

const SEGUNDO = 1000;

/** Errores que no cuestan nada: tipear mal una vez le pasa a cualquiera. */
export const INTENTOS_LIBRES = 4;
/** Techo de la espera. Nunca deja un local sin poder cobrar por mucho rato. */
export const ESPERA_MAXIMA_SEG = 60;
/** Si no hubo errores por este rato, se borra el historial. */
export const OLVIDO_MIN = 15;

type Registro = { fallos: number; ultimoEn: number };

const porUsuario = new Map<string, Registro>();

function clave(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** Cuánto crece la espera: 5s, 10s, 20s, 40s, 60s, 60s… */
function esperaPara(fallos: number): number {
  if (fallos <= INTENTOS_LIBRES) return 0;
  const escalon = fallos - INTENTOS_LIBRES;
  return Math.min(5 * 2 ** (escalon - 1), ESPERA_MAXIMA_SEG);
}

function vigente(registro: Registro | undefined, ahora: number): Registro | undefined {
  if (!registro) return undefined;
  if (ahora - registro.ultimoEn > OLVIDO_MIN * 60 * SEGUNDO) return undefined;
  return registro;
}

/**
 * Segundos que faltan antes de poder volver a probar. 0 si puede probar ahora.
 */
export function esperaPendiente(usuario: string, ahora = Date.now()): number {
  const registro = vigente(porUsuario.get(clave(usuario)), ahora);
  if (!registro) return 0;
  const espera = esperaPara(registro.fallos) * SEGUNDO;
  const falta = registro.ultimoEn + espera - ahora;
  return falta > 0 ? Math.ceil(falta / SEGUNDO) : 0;
}

/** Un intento fallido. Devuelve cuántos segundos tiene que esperar ahora. */
export function registrarFallo(usuario: string, ahora = Date.now()): number {
  const k = clave(usuario);
  const registro = vigente(porUsuario.get(k), ahora) ?? { fallos: 0, ultimoEn: ahora };
  registro.fallos += 1;
  registro.ultimoEn = ahora;
  porUsuario.set(k, registro);
  return esperaPara(registro.fallos);
}

/** Entró bien: se olvida todo. */
export function registrarExito(usuario: string): void {
  porUsuario.delete(clave(usuario));
}

/** Sólo para los tests. */
export function olvidarTodo(): void {
  porUsuario.clear();
}
