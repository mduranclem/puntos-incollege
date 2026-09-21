/**
 * Freno a los intentos de ingreso (D-034, ajustado en D-035).
 *
 * **No está puesto para el vendedor.** Está puesto para alguien en internet
 * probando contraseñas contra la URL pública: el nombre de usuario del mostrador
 * no es un secreto (`mostrador-fisherton` se adivina), así que lo único que
 * protege la caja es la contraseña.
 *
 * Por eso está calibrado para ser invisible para una persona: diez intentos sin
 * ninguna demora, y recién después una pausa fija de cinco segundos. Nadie
 * tipea mal diez veces seguidas en el mostrador; una máquina hace diez mil.
 * Cinco segundos entre intentos bajan un ataque de miles por segundo a unos
 * pocos por minuto, que contra una contraseña de ocho caracteres no lleva a
 * ningún lado.
 *
 * No hay bloqueo, ni escalera, ni "volvé en quince minutos": la peor cosa que
 * le puede pasar a alguien del local es esperar cinco segundos, una sola vez.
 *
 * Vive en memoria y se pierde al reiniciar. Alcanza: es un solo proceso (D-032)
 * y lo que frena es la velocidad, no la cantidad total de intentos.
 */

const SEGUNDO = 1000;

/** Errores sin ninguna demora. Alto a propósito: una persona no llega acá. */
export const INTENTOS_LIBRES = 10;
/** La única pausa que existe, y es siempre la misma. */
export const ESPERA_SEG = 5;
/** Si no hubo errores por este rato, se borra el historial. */
export const OLVIDO_MIN = 15;

type Registro = { fallos: number; ultimoEn: number };

const porUsuario = new Map<string, Registro>();

function clave(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** Sin escalera: o no hay espera, o son cinco segundos. */
function esperaPara(fallos: number): number {
  return fallos <= INTENTOS_LIBRES ? 0 : ESPERA_SEG;
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
