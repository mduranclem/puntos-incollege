/**
 * Catálogo de artículos (D-027). Sólo gerencia.
 *
 * Esta lista sirve para dos cosas a la vez: los botones que toca la vendedora al
 * cobrar y las Novedades que ve el cliente en su app. Cada artículo tiene un
 * interruptor para cada uso, así se puede tener algo en el mostrador sin
 * publicarlo, o al revés.
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi, type Articulo } from '../../api';

const LINEAS = [
  { valor: 'UNIFORMES', texto: 'Uniformes' },
  { valor: 'ROPA_LISA', texto: 'Ropa lisa' },
] as const;

const nuevo = { nombre: '', precio: '', lineaDeNegocio: 'UNIFORMES' as string, detalle: '' };

export function PanelArticulos() {
  const [articulos, setArticulos] = useState<Articulo[] | null>(null);
  const [alta, setAlta] = useState(nuevo);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const d = await api<{ articulos: Articulo[] }>('/articulos?todos=si');
    setArticulos(d.articulos);
  }

  useEffect(() => {
    cargar().catch((e) =>
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el catálogo.'),
    );
  }, []);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    try {
      await api('/articulos', { cuerpo: alta });
      setAlta({ ...nuevo, lineaDeNegocio: alta.lineaDeNegocio });
      setAbriendo(false);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo agregar el artículo.');
    }
  }

  async function cambiar(id: string, cambios: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/articulos/${id}`, { metodo: 'PATCH', cuerpo: cambios });
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el cambio.');
    }
  }

  if (error && !articulos) return <p className="aviso-error">{error}</p>;
  if (!articulos) return <p className="text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="aviso-error">{error}</p>}

      {!abriendo ? (
        <button className="boton-principal" onClick={() => setAbriendo(true)}>
          Agregar artículo
        </button>
      ) : (
        <form className="tarjeta space-y-3" onSubmit={crear}>
          <h3 className="font-semibold">Nuevo artículo</h3>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div>
              <label className="etiqueta" htmlFor="a-nombre">
                Nombre
              </label>
              <input
                id="a-nombre"
                className="campo"
                placeholder="Chomba bordada"
                value={alta.nombre}
                onChange={(e) => setAlta({ ...alta, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="a-precio">
                Precio de lista
              </label>
              <input
                id="a-precio"
                className="campo tabular"
                inputMode="decimal"
                placeholder="26950"
                value={alta.precio}
                onChange={(e) => setAlta({ ...alta, precio: e.target.value.replace(/[^\d.,]/g, '') })}
                required
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="a-linea">
                Línea
              </label>
              <select
                id="a-linea"
                className="campo"
                value={alta.lineaDeNegocio}
                onChange={(e) => setAlta({ ...alta, lineaDeNegocio: e.target.value })}
              >
                {LINEAS.map((l) => (
                  <option key={l.valor} value={l.valor}>
                    {l.texto}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="boton-principal">Agregar</button>
            <button type="button" className="boton-secundario" onClick={() => setAbriendo(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Artículo</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3">Línea</th>
              <th className="px-4 py-3">En el mostrador</th>
              <th className="px-4 py-3">En la app</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-borde)]">
            {articulos.map((a) => (
              <tr key={a.id} className={a.activo ? '' : 'opacity-55'}>
                <td className="px-4 py-3 font-medium">{a.nombre}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    className="campo tabular w-28 py-1.5 text-right text-sm"
                    defaultValue={a.precioTexto.replace('$', '')}
                    onBlur={(e) => {
                      const valor = e.target.value.replace(/[^\d.,]/g, '');
                      if (valor && valor !== a.precioTexto.replace('$', '')) {
                        void cambiar(a.id, { precio: valor });
                      }
                    }}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {LINEAS.find((l) => l.valor === a.lineaDeNegocio)?.texto ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <label className="interruptor">
                    <input
                      type="checkbox"
                      checked={a.activo}
                      onChange={(e) => void cambiar(a.id, { activo: e.target.checked })}
                    />
                    <span>{a.activo ? 'Sí' : 'No'}</span>
                  </label>
                </td>
                <td className="px-4 py-3">
                  <label className="interruptor">
                    <input
                      type="checkbox"
                      checked={a.visibleEnApp}
                      onChange={(e) => void cambiar(a.id, { visibleEnApp: e.target.checked })}
                    />
                    <span>{a.visibleEnApp ? 'Sí' : 'No'}</span>
                  </label>
                </td>
              </tr>
            ))}
            {articulos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay artículos. Agregá los que más se venden: son los botones
                  que va a tocar la vendedora al cobrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-slate-500">
        El precio se guarda al salir del campo. Cambiarlo no toca las ventas ya
        registradas: cada venta guardó el precio del momento.
      </p>
    </div>
  );
}
