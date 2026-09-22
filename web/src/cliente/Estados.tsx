/**
 * Carga y error de las pantallas secundarias (D-039).
 *
 * La carga reserva el lugar con bloques grises en vez de un "Cargando…"
 * centrado: la pantalla no salta cuando llegan los datos. El error dice qué no
 * se pudo y ofrece reintentar, que es lo único que la persona puede hacer.
 */

/** Filas grises del alto de una tarjeta, para que el lugar quede reservado. */
export function Cargando({ filas = 3, etiqueta }: { filas?: number; etiqueta: string }) {
  return (
    <div className="cta" aria-busy="true" aria-live="polite">
      <div className="esqueleto h-8 w-44" />
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto h-[96px] w-full rounded-[20px]" />
      ))}
      <span className="sr-only">{etiqueta}</span>
    </div>
  );
}

export function ErrorDePantalla({
  mensaje,
  alReintentar,
}: {
  mensaje: string;
  alReintentar: () => void;
}) {
  return (
    <div className="cta">
      <div className="cta-error">
        <p>{mensaje}</p>
        <button type="button" className="cta-reintentar" onClick={alReintentar}>
          Reintentar
        </button>
      </div>
    </div>
  );
}
