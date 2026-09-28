/**
 * Los cuatro fondos de la app del cliente, y el orden de las pestañas (D-047).
 *
 * Todo lo que distingue a un fondo de otro está acá y en ningún otro lado: el
 * archivo, cuánto se agranda, dónde se corre y con qué intensidad se ve. El
 * componente que los dibuja no sabe nada de ninguna ilustración en particular.
 *
 * **Por qué hay valores distintos por vista.** Las cuatro ilustraciones son
 * dibujos separados, no encuadres de uno solo: el oso no está ni del mismo
 * tamaño ni a la misma altura en las cuatro. Medido sobre los originales de
 * 852×1846, tomando la distancia entre pupilas como referencia de tamaño:
 *
 *     vista         pupilas (y)   separación   centro de la cabeza (x)
 *     Mi cuenta        24,3 %       20,4 %            47,2 %
 *     Movimientos      29,8 %       18,1 %            46,6 %
 *     Locales          23,0 %       18,6 %            50,1 %
 *     Precios          22,0 %       16,6 %            58,3 %
 *
 * La cabeza más chica (Precios) es un 23 % menor que la más grande, y la más
 * baja (Movimientos) está casi 8 puntos por debajo de la más alta. Usar los
 * mismos números en las cuatro haría que el oso pegue un salto en cada cambio
 * de pestaña. Las escalas y los desplazamientos de abajo son los que igualan la
 * cabeza; están calculados, no elegidos a ojo.
 *
 * **Qué no se iguala, y por qué.** La posición horizontal se deja casi como
 * está dibujada. Centrar la cabeza de Precios exigiría correr la ilustración un
 * 13 % a la izquierda y la chomba que sostiene se saldría de la pantalla. El
 * pedido es que la cabeza quede a la misma *altura* y del mismo *tamaño*; el
 * encuadre horizontal es parte del dibujo y se respeta.
 */

export type Fondo = {
  /** Archivo en `public/fondos/`. */
  archivo: string;
  /** Ancho como proporción del ancho de la app. 1 = exactamente el ancho. */
  escala: number;
  /** Corrimiento horizontal, en porcentaje del ancho de la propia imagen. */
  x: number;
  /** Corrimiento vertical, en porcentaje del alto de la propia imagen. */
  y: number;
  /**
   * Intensidad permanente de la ilustración. Es la opacidad de la imagen, no la
   * de la capa: la capa usa la suya para entrar y salir, y las dos no se pisan.
   */
  opacidad: number;
  /**
   * Velo marino por encima de la ilustración, para bajarle intensidad sin
   * volverla transparente. Sólo lo necesita Movimientos.
   */
  velo?: number;
  /**
   * Color de la capa por detrás de la imagen. Sólo Movimientos, que trae su
   * propio marino: así nunca se le ve un borde, ni en una pantalla más alta que
   * la ilustración.
   */
  base?: boolean;
};

/**
 * El orden importa: define hacia qué lado se desplazan las vistas. Es el mismo
 * orden en que están las pestañas en la barra de abajo.
 */
export const ORDEN = ['/app', '/app/movimientos', '/app/locales', '/app/novedades'] as const;

export type RutaDeApp = (typeof ORDEN)[number];

export const FONDOS: Record<RutaDeApp, Fondo> = {
  // La referencia. Escala 1 quiere decir que la ilustración entra justo en el
  // ancho de la pantalla, que es como fueron dibujadas: 852×1846 es proporción
  // 2,167, y un teléfono de 390×844 es 2,164.
  '/app': {
    archivo: 'micuenta',
    escala: 1.0,
    x: 0,
    y: 0,
    opacidad: 0.2,
  },

  // La cabeza más chica y más baja de las cuatro. Y la única ilustración que ya
  // viene con el marino adentro y el personaje atenuado: por eso va a opacidad
  // entera con un velo encima, en vez de transparente. Aplicarle el 0,20 de las
  // otras la haría desaparecer.
  '/app/movimientos': {
    archivo: 'movimientos',
    escala: 1.13,
    x: 0,
    y: -8.3,
    opacidad: 1,
    velo: 0.18,
    base: true,
  },

  '/app/locales': {
    archivo: 'locales',
    escala: 1.1,
    x: 0,
    y: -0.9,
    opacidad: 0.2,
  },

  // El corrimiento de -6 % es medio camino: la cabeza está dibujada al 58 % del
  // ancho porque el oso sostiene una chomba a su izquierda. Centrarla del todo
  // se comería la chomba.
  '/app/novedades': {
    archivo: 'precios',
    escala: 1.23,
    x: -6,
    y: -2.2,
    opacidad: 0.2,
  },
};

export const rutaDeFondo = (pathname: string): RutaDeApp => {
  const limpia = pathname.replace(/\/+$/, '') || '/app';
  return (ORDEN as readonly string[]).includes(limpia) ? (limpia as RutaDeApp) : '/app';
};

export const indiceDe = (pathname: string) => ORDEN.indexOf(rutaDeFondo(pathname));

export const urlDelFondo = (f: Fondo) => `/fondos/${f.archivo}.webp`;
