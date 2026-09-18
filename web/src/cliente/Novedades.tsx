/**
 * Novedades y precios. Es lo que hace que el cliente conozca las líneas por las
 * que no vino: uno de los dos motivos por los que existe el programa.
 *
 * Lo carga la administración desde el panel. Si no hay nada cargado, la pantalla
 * lo dice y no finge contenido.
 */
import { useEffect, useState } from 'react';
import { apiCliente, type Novedad } from './api';

const NOMBRE_LINEA: Record<string, string> = {
  UNIFORMES: 'Uniformes',
  ROPA_LISA: 'Ropa lisa',
  EGRESADOS: 'Egresados',
};

export function Novedades() {
  const [novedades, setNovedades] = useState<Novedad[] | null>(null);

  useEffect(() => {
    apiCliente<{ novedades: Novedad[] }>('/novedades')
      .then((d) => setNovedades(d.novedades))
      .catch(() => setNovedades([]));
  }, []);

  if (!novedades) {
    return (
      <div className="cta-centro">
        <p className="cta-cargando">Cargando…</p>
      </div>
    );
  }

  const porLinea = new Map<string, Novedad[]>();
  for (const n of novedades) {
    const clave = n.lineaDeNegocio ?? 'OTRAS';
    porLinea.set(clave, [...(porLinea.get(clave) ?? []), n]);
  }

  return (
    <div className="cta">
      <h1 className="pantalla-titulo">Novedades</h1>

      {novedades.length === 0 ? (
        <div className="vacio">
          <p className="vacio-titulo">Todavía no hay novedades</p>
          <p>Cuando haya precios o promociones para mostrar, van a aparecer acá.</p>
        </div>
      ) : (
        [...porLinea.entries()].map(([linea, items]) => (
          <section key={linea} className="nov-grupo">
            <h2 className="nov-grupo-titulo">{NOMBRE_LINEA[linea] ?? 'Otras'}</h2>
            <ul className="novedades">
              {items.map((n) => (
                <li key={n.id} className="novedad">
                  <div className="novedad-texto">
                    <h3>{n.titulo}</h3>
                    {n.detalle && <p>{n.detalle}</p>}
                  </div>
                  {n.precioTexto && <span className="novedad-precio">{n.precioTexto}</span>}
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
