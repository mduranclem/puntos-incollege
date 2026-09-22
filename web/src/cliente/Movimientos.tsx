/**
 * Historial completo, agrupado por mes. Es la pantalla del "¿y esto cuándo fue?".
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  apiCliente,
  cerrarAcceso,
  CLASE_MOVIMIENTO,
  TEXTO_MOVIMIENTO,
  type Cuenta as DatosCuenta,
  type Movimiento,
} from './api';
import { Cargando, ErrorDePantalla } from './Estados';

const mesDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

const diaDe = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

export function Movimientos() {
  const [cuenta, setCuenta] = useState<DatosCuenta | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const navegar = useNavigate();

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    apiCliente<DatosCuenta>('/cuenta', { conSesion: true })
      .then((datos) => {
        setCuenta(datos);
        setCargando(false);
      })
      .catch((e) => {
        if (e?.codigo === 'LINK_INVALIDO') {
          cerrarAcceso();
          navegar('/app/entrar', { replace: true });
          return;
        }
        setError(true);
        setCargando(false);
      });
  }, [navegar]);

  useEffect(cargar, [cargar]);

  if (cargando) return <Cargando etiqueta="Cargando tus movimientos" />;
  if (error || !cuenta) {
    return <ErrorDePantalla mensaje="No pudimos cargar tus movimientos" alReintentar={cargar} />;
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
          <p className="vacio-titulo">Acá vas a ver tus puntos en movimiento</p>
          <p>
            Después de tu primera compra, vas a encontrar los puntos que sumaste y los
            descuentos que usaste.
          </p>
          <Link className="vacio-accion" to="/app/locales">
            Ver locales
          </Link>
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
                  {/* Signo, texto y fecha: el color es lo último que informa. */}
                  <span className={`cta-lista-pts ${CLASE_MOVIMIENTO[m.tipo]}`}>
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
