/**
 * El visor de la app del cliente: las cuatro pestañas y sus fondos (D-047).
 *
 * Hace tres cosas que están juntas porque son la misma cosa: dibuja el fondo
 * que le toca a cada pestaña, desliza la vista que sale y la que entra, y se
 * acuerda de dónde había quedado el scroll de cada una.
 *
 * **Por qué el fondo vive acá y no en cada pantalla.** Si cada vista pusiera el
 * suyo, al cambiar de pestaña habría un momento con dos, o con ninguno. Acá hay
 * una sola capa de fondos que sabe cuál sale y cuál entra, y el orden de
 * `ORDEN` decide hacia qué lado.
 *
 * **Por qué cada vista tiene su propio scroll.** Durante la transición hay dos
 * vistas montadas a la vez. Si el que se desplazara fuera el documento, las dos
 * compartirían una única posición: al entrar a Movimientos con el historial a
 * mitad de camino, Locales aparecería también a mitad de camino. Con un scroll
 * por panel cada pestaña se acuerda del suyo, que es lo que uno espera.
 *
 * **Nada de esto corre si el sistema pide menos movimiento.** Con
 * `prefers-reduced-motion` no se monta la vista saliente: se cambia y ya.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { FONDOS, ORDEN, indiceDe, rutaDeFondo, urlDelFondo, type RutaDeApp } from './fondos';

/** Lo que dura el cruce. El mismo número está en el CSS; acá se usa para limpiar. */
const DURACION = 250;

const menosMovimiento = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Panel = { ruta: RutaDeApp; vista: React.ReactNode };

/**
 * Dónde quedó el scroll de cada pestaña. Vive fuera del componente a propósito:
 * tiene que sobrevivir a que el panel se desmonte al salir de la pestaña.
 */
const scrollGuardado = new Map<string, number>();

function PanelDeVista({
  panel,
  sentido,
  estado,
}: {
  panel: Panel;
  sentido: 1 | -1;
  /** 'quieto' en reposo; si no, si está entrando o saliendo. */
  estado: 'quieto' | 'entra' | 'sale';
}) {
  const caja = useRef<HTMLDivElement>(null);

  // Antes de pintar, no después: si se restaura en un efecto normal se ve el
  // salto desde arriba.
  useLayoutEffect(() => {
    if (estado === 'sale') return;
    const n = caja.current;
    if (n) n.scrollTop = scrollGuardado.get(panel.ruta) ?? 0;
    // Sólo al montar el panel de esta ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.ruta]);

  const recordar = useCallback(() => {
    const n = caja.current;
    if (n) scrollGuardado.set(panel.ruta, n.scrollTop);
  }, [panel.ruta]);

  const saliendo = estado === 'sale';
  const clase =
    estado === 'quieto'
      ? 'panel'
      : `panel panel-${estado} panel-${estado}-${sentido === 1 ? 'izq' : 'der'}`;

  return (
    <div
      ref={caja}
      className={clase}
      onScroll={recordar}
      // La que se va no se toca, no se tabula y no la leen los lectores de
      // pantalla: por un cuarto de segundo sigue en el DOM, pero ya no está.
      aria-hidden={saliendo || undefined}
      {...(saliendo ? ({ inert: '' } as Record<string, string>) : {})}
    >
      <div className="panel-contenido">{panel.vista}</div>
    </div>
  );
}

function CapaDeFondo({
  ruta,
  sentido,
  estado,
}: {
  ruta: RutaDeApp;
  sentido: 1 | -1;
  estado: 'quieto' | 'entra' | 'sale';
}) {
  const f = FONDOS[ruta];
  const clase =
    estado === 'quieto'
      ? 'fondo-capa'
      : `fondo-capa fondo-${estado} fondo-${estado}-${sentido === 1 ? 'izq' : 'der'}`;

  return (
    <div className={clase} style={f.base ? { background: 'var(--color-marino)' } : undefined}>
      <img
        src={urlDelFondo(f)}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="fondo-imagen"
        style={
          {
            '--escala': f.escala,
            '--corrimiento-x': `${f.x}%`,
            '--corrimiento-y': `${f.y}%`,
            opacity: f.opacidad,
          } as React.CSSProperties
        }
      />
      {f.velo ? <div className="fondo-velo" style={{ opacity: f.velo }} /> : null}
    </div>
  );
}

export function Visor() {
  const ubicacion = useLocation();
  const vista = useOutlet();
  const ruta = rutaDeFondo(ubicacion.pathname);

  const [actual, setActual] = useState<Panel>({ ruta, vista });
  const [saliente, setSaliente] = useState<Panel | null>(null);
  const [sentido, setSentido] = useState<1 | -1>(1);
  const reloj = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (ruta === actual.ruta) {
      // La misma pestaña: puede haber cambiado el contenido, pero no se anima.
      setActual({ ruta, vista });
      return;
    }

    const haciaLaDerecha = indiceDe(ruta) > indiceDe(actual.ruta) ? 1 : -1;
    setSentido(haciaLaDerecha);

    if (menosMovimiento()) {
      setSaliente(null);
      setActual({ ruta, vista });
      return;
    }

    // Si ya había una transición andando, la que estaba saliendo se descarta y
    // la que estaba entrando pasa a ser la que sale. Tocar cuatro pestañas
    // rápido hace una sola transición, no cuatro encimadas.
    setSaliente(actual);
    setActual({ ruta, vista });

    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setSaliente(null), DURACION + 30);
    // `vista` cambia en cada render; el disparador es la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  useEffect(() => () => window.clearTimeout(reloj.current), []);

  // Los otros tres fondos se piden después, cuando ya se vio el primero. Que la
  // pestaña que se abre tarde en pintar por descargar fondos que todavía nadie
  // pidió sería cambiar lo que importa por lo que decora.
  useEffect(() => {
    const pedir = () => {
      for (const r of ORDEN) {
        if (r === ruta) continue;
        new Image().src = urlDelFondo(FONDOS[r]);
      }
    };
    // `requestIdleCallback` no existe en Safari hasta la 16.4; el respaldo es un
    // temporizador, que para esto alcanza de sobra.
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(pedir);
      return;
    }
    const id = window.setTimeout(pedir, 1200);
    return () => window.clearTimeout(id);
    // Una sola vez: sólo importa cuál era la pestaña de entrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="fondos" aria-hidden="true">
        {saliente ? <CapaDeFondo ruta={saliente.ruta} sentido={sentido} estado="sale" /> : null}
        <CapaDeFondo
          key={actual.ruta}
          ruta={actual.ruta}
          sentido={sentido}
          estado={saliente ? 'entra' : 'quieto'}
        />
      </div>

      <main className="app-visor">
        {saliente ? (
          <PanelDeVista key={saliente.ruta} panel={saliente} sentido={sentido} estado="sale" />
        ) : null}
        <PanelDeVista
          key={actual.ruta}
          panel={actual}
          sentido={sentido}
          estado={saliente ? 'entra' : 'quieto'}
        />
      </main>
    </>
  );
}
