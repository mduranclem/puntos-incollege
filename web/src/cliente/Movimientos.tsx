/**
 * Historial completo, agrupado por mes. Es la pantalla del "¿y esto cuándo fue?".
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  apiCliente,
  cerrarAcceso,
  TEXTO_MOVIMIENTO,
  type Cuenta as DatosCuenta,
  type Movimiento,
} from './api';

const mesDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

const diaDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

export function Movimientos() {
  const [cuenta, setCuenta] = useState<DatosCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navegar = useNavigate();

  useEffect(() => {
    apiCliente<DatosCuenta>('/cuenta', { conSesion: true })
      .then(setCuenta)
      .catch((e) => {
        if (e?.codigo === 'LINK_INVALIDO') {
          cerrarAcceso();
          navegar('/app/entrar', { replace: true });
          return;
        }
        setError('No pudimos cargar tus movimientos. Probá de nuevo en un momento.');
      });
  }, [navegar]);

  if (error) {
    return (
      <div className="cta-centro">
        <p>{error}</p>
      </div>
    );
  }

  if (!cuenta) {
    return (
      <div className="cta-centro">
        <p className="cta-cargando">Cargando…</p>
      </div>
    );
  }

  const porMes = new Map<string, Movimiento[]>();
  for (const m of cuenta.movimientos) {
    const clave = mesDe(m.fecha);
    porMes.set(clave, [...(porMes.get(clave) ?? []), m]);
  }

  return (
    <div className="cta">
      <h1 className="pantalla-titulo">Movimientos</h1>

      {cuenta.movimientos.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Todavía no tenés movimientos</p>
          <p>
            Vas a ver acá cada compra que sume puntos y cada descuento que uses.
            Empezás a sumar pagando en efectivo en el local.
          </p>
        </div>
      ) : (
        [...porMes.entries()].map(([mes, movimientos]) => (
          <section key={mes} className="mov-mes">
            <h2 className="mov-mes-titulo">{mes}</h2>
            <ul className="cta-lista">
              {movimientos.map((m, i) => (
                <li key={`${mes}-${i}`}>
                  <span className="cta-lista-que">
                    {TEXTO_MOVIMIENTO[m.tipo]}
                    <small>
                      {diaDe(m.fecha)}
                      {m.montoTexto ? ` · ${m.montoTexto}` : ''}
                      {m.local ? ` · ${m.local}` : ''}
                    </small>
                  </span>
                  <span className={`cta-lista-pts ${m.puntos > 0 ? 'suma' : 'resta'}`}>
                    {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
