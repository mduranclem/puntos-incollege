/**
 * El logotipo de InCollege (D-037).
 *
 * Un solo componente para todas las pantallas: si mañana cambia el archivo, se
 * cambia acá y listo. Va con `alt` vacío y `aria-hidden` cuando al lado hay un
 * texto que ya dice el nombre, para que el lector de pantalla no lo repita dos
 * veces.
 */

type Props = {
  /** Alto en píxeles. El ancho sale solo: el logo es apaisado. */
  alto?: number;
  /** Texto alternativo. Vacío si al lado ya está escrito el nombre. */
  alt?: string;
  className?: string;
};

export function Logo({ alto = 40, alt = 'InCollege', className = '' }: Props) {
  return (
    <img
      src="/logo-incollege.png"
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={className}
      style={{ height: alto, width: 'auto' }}
      // El logo entra en el primer pintado de casi todas las pantallas: que no
      // se cargue tarde y empuje el resto.
      fetchPriority="high"
      decoding="async"
    />
  );
}
