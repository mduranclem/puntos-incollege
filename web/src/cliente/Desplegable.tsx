/**
 * Desplegable de la app del cliente (D-039).
 *
 * Un solo componente para el QR y para las condiciones, así los dos se abren
 * igual y los dos anuncian su estado igual. La cabecera entera es el botón
 * —no sólo la flecha— y mide 48 px de alto como mínimo, que es lo que se
 * necesita para darle con el pulgar sin apuntar.
 *
 * El estado abierto/cerrado se puede manejar desde afuera (el QR necesita
 * saberlo para dibujarse recién al abrirse) o dejarlo adentro.
 */
import { useId, useState, type ReactNode } from 'react';

type Props = {
  titulo: string;
  /** Línea secundaria en la cabecera. Opcional. */
  detalle?: ReactNode;
  children: ReactNode;
  /** Si viene, el estado lo maneja quien use el componente. */
  abierto?: boolean;
  alCambiar?: (abierto: boolean) => void;
};

export function Desplegable({ titulo, detalle, children, abierto, alCambiar }: Props) {
  const [propio, setPropio] = useState(false);
  const controlado = abierto !== undefined;
  const estaAbierto = controlado ? abierto : propio;
  const idCuerpo = useId();

  function alternar() {
    const siguiente = !estaAbierto;
    if (!controlado) setPropio(siguiente);
    alCambiar?.(siguiente);
  }

  return (
    <section className="desplegable">
      <button
        type="button"
        className="desplegable-cabecera"
        onClick={alternar}
        aria-expanded={estaAbierto}
        aria-controls={idCuerpo}
      >
        <span>
          <span className="desplegable-titulo">{titulo}</span>
          {detalle && <span className="desplegable-dato block">{detalle}</span>}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          className={`desplegable-flecha${estaAbierto ? ' abierta' : ''}`}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {/* Se desmonta al cerrarse: el QR se vuelve a dibujar al abrir, y así no
          queda un lienzo vacío ocupando lugar. */}
      {estaAbierto && (
        <div className="desplegable-cuerpo" id={idCuerpo}>
          {children}
        </div>
      )}
    </section>
  );
}
