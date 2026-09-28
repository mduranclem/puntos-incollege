/**
 * Secretos de firma y coste del hash (D-044).
 *
 * **Por qué el sistema no arranca sin secreto.** Antes cada módulo hacía
 * `process.env.JWT_SECRET ?? 'cambiar-en-produccion'`. Si la variable faltaba,
 * estaba vacía o tenía una tipografía distinta, el servicio levantaba igual y
 * firmaba las sesiones con una cadena que está escrita en este repositorio y en
 * `.env.example`. Cualquiera que la leyera podía fabricarse un token de gerente.
 *
 * Lo peor no era el agujero: era que **no había ninguna señal**. Todo funcionaba.
 * Ahora falla al arrancar, fuerte y temprano, que es el mismo criterio de D-029
 * con los PIN del seed: que el despliegue se caiga una vez es molesto; que la
 * caja quede abierta es un problema todos los días.
 */

/** Valores de ejemplo que nunca pueden usarse de verdad. */
const DE_EJEMPLO = ['cambiar-en-produccion', 'cambiar-en-produccion-tambien'];

const MINIMO = 24;

/**
 * Devuelve el secreto o tira. Se llama en cada firma y verificación, así que
 * una variable borrada en caliente también se detecta.
 */
export function secretoObligatorio(nombre: 'JWT_SECRET' | 'TOKEN_CLIENTE_SECRET'): string {
  const valor = process.env[nombre]?.trim() ?? '';

  if (!valor) {
    throw new Error(
      `Falta ${nombre}. Sin ese secreto las sesiones se podrían falsificar, ` +
        'así que el sistema no arranca. Poné una cadena larga y aleatoria.',
    );
  }
  if (DE_EJEMPLO.some((ejemplo) => valor.startsWith(ejemplo))) {
    throw new Error(
      `${nombre} tiene el valor de ejemplo del repositorio. Es público: cualquiera ` +
        'que lo lea puede firmar sesiones. Poné uno propio.',
    );
  }
  if (valor.length < MINIMO) {
    throw new Error(`${nombre} es demasiado corto: tiene que tener al menos ${MINIMO} caracteres.`);
  }
  return valor;
}

/**
 * Coste de bcrypt. Subido de 10 a 12: son unos 280 ms por hash en una máquina
 * de escritorio y medio segundo en el servidor, que para algo que pasa una vez
 * por turno no se nota, y cuadruplica lo que le cuesta a alguien probar
 * contraseñas contra un volcado de la base.
 *
 * Los hashes viejos siguen sirviendo: bcrypt guarda el coste adentro del hash y
 * se verifica con el que tenía. Se van actualizando solos a medida que cada uno
 * cambia su contraseña.
 */
export const COSTE_BCRYPT = 12;
