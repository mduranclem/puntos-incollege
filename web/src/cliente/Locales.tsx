/**
 * Los locales. No hace falta estar identificado para verlos.
 *
 * Si todavía no cargaron la dirección desde el panel, se muestra el local igual
 * con el nombre: media ficha es mejor que una pantalla vacía.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiCliente, type Local } from './api';
import { Cargando, ErrorDePantalla } from './Estados';

const comoLlegar = (local: Local) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${local.direccion ?? local.nombre}, ${local.nombre.includes('Santa Fe') ? 'Santa Fe' : local.nombre.includes('Nicolás') ? 'San Nicolás' : 'Rosario'}, Argentina`,
  )}`;

export function Locales() {
  const [locales, setLocales] = useState<Local[] | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    apiCliente<{ locales: Local[] }>('/locales')
      .then((d) => {
        setLocales(d.locales);
        setCargando(false);
      })
      .catch(() => {
        setError(true);
        setCargando(false);
      });
  }, []);

  useEffect(cargar, [cargar]);

  if (cargando) return <Cargando filas={4} etiqueta="Cargando los locales" />;
  if (error || !locales) {
    return <ErrorDePantalla mensaje="No pudimos cargar los locales" alReintentar={cargar} />;
  }

  return (
    <div className="cta">
      <h1 className="pantalla-titulo">Locales</h1>
      <p className="pantalla-bajada">
        Sumás puntos pagando en efectivo en cualquiera de ellos.
      </p>

      <ul className="locales">
        {locales.map((local) => (
          <li key={local.id} className="local">
            <h2>{local.nombre}</h2>
            {local.direccion && <p className="local-dir">{local.direccion}</p>}
            {local.horarios && <p className="local-hor">{local.horarios}</p>}
            <div className="local-acciones">
              {local.telefono && (
                <a className="local-boton" href={`tel:${local.telefono.replace(/\s/g, '')}`}>
                  Llamar
                </a>
              )}
              <a
                className="local-boton"
                href={comoLlegar(local)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Cómo llegar
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
