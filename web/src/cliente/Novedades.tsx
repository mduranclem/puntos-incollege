/**
 * Precios. Es lo que hace que el cliente conozca las líneas por las que no
 * vino: uno de los dos motivos por los que existe el programa.
 *
 * Se llama "Precios" y no "Novedades" porque es lo que muestra: el catálogo con
 * su precio de lista (D-039). La ruta sigue siendo `/app/novedades` para no
 * romper ningún enlace ya repartido.
 *
 * Lo carga la administración desde el panel. Si no hay nada cargado, la pantalla
 * lo dice y no finge contenido.
 *
 * **Agrupa por categoría de prenda** —Chombas, Remeras, Buzos— y no por línea de
 * negocio (D-049). La línea sirve para los puntos; a quien mira precios le
 * importa si busca un buzo o una chomba, no de qué lista sale. La línea sigue
 * estando, como etiqueta de cada prenda.
 *
 * Cada prenda muestra sus cuatro talles con su precio. La diferencia entre el
 * más chico y el más grande llega a $7.700: un precio solo sería engañoso.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiCliente, type Novedad } from './api';
import { Cargando, ErrorDePantalla } from './Estados';

const NOMBRE_LINEA: Record<string, string> = {
  UNIFORMES: 'Uniformes',
  ROPA_LISA: 'Ropa lisa',
  EGRESADOS: 'Egresados',
};

export function Novedades() {
  const [novedades, setNovedades] = useState<Novedad[] | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    apiCliente<{ novedades: Novedad[] }>('/novedades')
      .then((d) => {
        setNovedades(d.novedades);
        setCargando(false);
      })
      .catch(() => {
        setError(true);
        setCargando(false);
      });
  }, []);

  useEffect(cargar, [cargar]);

  if (cargando) return <Cargando filas={3} etiqueta="Cargando los precios" />;
  if (error || !novedades) {
    return <ErrorDePantalla mensaje="No pudimos cargar los precios" alReintentar={cargar} />;
  }

  // El orden de las categorías es el que trae la API, que es el de la lista.
  const porCategoria = new Map<string, Novedad[]>();
  for (const n of novedades) {
    const clave = n.categoria ?? 'Otros';
    porCategoria.set(clave, [...(porCategoria.get(clave) ?? []), n]);
  }

  return (
    <div className="cta">
      <h1 className="pantalla-titulo">Precios</h1>

      {novedades.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Todavía no hay precios cargados</p>
          <p>Cuando la lista esté disponible, la vas a ver acá.</p>
        </div>
      ) : (
        [...porCategoria.entries()].map(([categoria, items]) => (
          <section key={categoria} className="nov-grupo">
            <h2 className="nov-grupo-titulo">{categoria}</h2>
            <ul className="novedades">
              {items.map((n) => (
                <li key={n.id} className="novedad">
                  <div className="novedad-texto">
                    <h3>{n.titulo}</h3>
                    {n.detalle && <p>{n.detalle}</p>}
                    {n.lineaDeNegocio && (
                      <span className="novedad-linea">{NOMBRE_LINEA[n.lineaDeNegocio]}</span>
                    )}
                  </div>

                  {n.precios.length > 0 ? (
                    <ul className="novedad-talles">
                      {n.precios.map((p) => (
                        <li key={p.talle}>
                          <span className="novedad-talle">{p.talle}</span>
                          <span className="novedad-precio">{p.precioTexto}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    n.precioTexto && <span className="novedad-precio">{n.precioTexto}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="nov-pie">
        Los precios son de lista y pueden cambiar. Consultá en el local.
      </p>
    </div>
  );
}
