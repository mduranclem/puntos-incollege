/**
 * Catálogo y lista de precios (D-027, con talles desde D-049). Sólo gerencia.
 *
 * Esta lista sirve para dos cosas a la vez: los botones que toca la vendedora al
 * cobrar y los Precios que ve el cliente en su app. Cada artículo tiene un
 * interruptor para cada uso, así se puede tener algo en el mostrador sin
 * publicarlo, o al revés.
 *
 * **Los precios por talle se guardan los cuatro juntos y con confirmación.**
 * Los interruptores se guardan solos porque son reversibles de un toque; un
 * precio no: queda cobrando mal hasta que alguien lo note. Por eso se escriben
 * los cuatro, se muestra antes qué cambia y de cuánto a cuánto, y recién ahí se
 * manda. La transacción del servidor hace el resto: o entran los cuatro o no
 * entra ninguno.
 *
 * Esconder esta pantalla no es la seguridad. La seguridad es `exigeRol
 * ('GERENTE')` en el servidor, que devuelve 403 aunque el pedido llegue por
 * fuera del navegador.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, ErrorApi, formatearPesos, TALLES, type Articulo, type Talle } from '../../api';

const LINEAS = [
  { valor: 'UNIFORMES', texto: 'Uniformes' },
  { valor: 'ROPA_LISA', texto: 'Ropa lisa' },
] as const;

const nuevo = { nombre: '', categoria: '', precio: '', lineaDeNegocio: 'UNIFORMES' as string, detalle: '' };

/** Sólo dígitos: un precio de lista es un entero de pesos (D-049). */
const soloEnteros = (texto: string) => texto.replace(/[^\d]/g, '');

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Lo que el gerente tipeó para un artículo, antes de confirmar. */
type Borrador = Record<string, string>;

export function PanelArticulos() {
  const [articulos, setArticulos] = useState<Articulo[] | null>(null);
  const [alta, setAlta] = useState(nuevo);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Borradores por artículo. Mientras no se confirme, no sale de la pantalla. */
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

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

  /** El precio de un talle tal como está guardado, en pesos enteros y sin símbolo. */
  const guardado = (a: Articulo, talle: Talle) => {
    const p = a.precios.find((x) => x.talle === talle);
    return p ? String(Math.round(Number(p.precioCentavos) / 100)) : '';
  };

  /** Qué cambió de verdad: lo que se va a mostrar al confirmar. */
  const cambiosDe = (a: Articulo) => {
    const b = borradores[a.id] ?? {};
    return TALLES.flatMap((talle) => {
      const antes = guardado(a, talle);
      const ahora = b[talle];
      if (ahora === undefined || ahora === antes) return [];
      return [{ talle, antes, ahora }];
    });
  };

  function tipear(a: Articulo, talle: Talle, valor: string) {
    setBorradores((prev) => ({
      ...prev,
      [a.id]: { ...(prev[a.id] ?? {}), [talle]: soloEnteros(valor) },
    }));
    if (confirmando === a.id) setConfirmando(null);
  }

  function descartar(id: string) {
    setBorradores((prev) => {
      const copia = { ...prev };
      delete copia[id];
      return copia;
    });
    setConfirmando(null);
  }

  async function guardarPrecios(a: Articulo) {
    const cambios = cambiosDe(a);
    if (cambios.length === 0) return;
    setError(null);
    setGuardando(a.id);
    try {
      await api(`/articulos/${a.id}/precios`, {
        metodo: 'PUT',
        cuerpo: { precios: cambios.map((c) => ({ talle: c.talle, precio: c.ahora })) },
      });
      descartar(a.id);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron guardar los precios.');
    } finally {
      setGuardando(null);
    }
  }

  const ultimoCambio = useMemo(() => {
    if (!articulos) return null;
    const todos = articulos.flatMap((a) => a.precios);
    if (todos.length === 0) return null;
    return todos.reduce((mas, p) => (p.actualizadoEn > mas.actualizadoEn ? p : mas));
  }, [articulos]);

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
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
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
              <label className="etiqueta" htmlFor="a-categoria">
                Categoría
              </label>
              <input
                id="a-categoria"
                className="campo"
                placeholder="Chombas"
                list="categorias-cargadas"
                value={alta.categoria}
                onChange={(e) => setAlta({ ...alta, categoria: e.target.value })}
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="a-precio">
                Precio base
              </label>
              <input
                id="a-precio"
                className="campo tabular"
                inputMode="numeric"
                placeholder="26950"
                value={alta.precio}
                onChange={(e) => setAlta({ ...alta, precio: soloEnteros(e.target.value) })}
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
          <p className="text-xs text-slate-500">
            Entra con un solo precio. Los cuatro talles se cargan después, en la tabla.
          </p>
          <div className="flex gap-2">
            <button className="boton-principal">Agregar</button>
            <button type="button" className="boton-secundario" onClick={() => setAbriendo(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <datalist id="categorias-cargadas">
        {[...new Set(articulos.map((a) => a.categoria).filter(Boolean))].map((c) => (
          <option key={c!} value={c!} />
        ))}
      </datalist>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Artículo</th>
              {TALLES.map((t) => (
                <th key={t} className="px-2 py-3 text-right">
                  {t}
                </th>
              ))}
              <th className="px-4 py-3" />
              <th className="px-4 py-3">Mostrador</th>
              <th className="px-4 py-3">App</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-borde)]">
            {articulos.map((a) => {
              const cambios = cambiosDe(a);
              const b = borradores[a.id] ?? {};
              return (
                <tr key={a.id} className={a.activo ? '' : 'opacity-55'}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{a.nombre}</span>
                    <small className="block text-xs text-slate-500">
                      {a.categoria ?? 'Sin categoría'} ·{' '}
                      {LINEAS.find((l) => l.valor === a.lineaDeNegocio)?.texto ?? '—'}
                    </small>
                  </td>

                  {TALLES.map((talle) => {
                    const antes = guardado(a, talle);
                    const valor = b[talle] ?? antes;
                    const tocado = b[talle] !== undefined && b[talle] !== antes;
                    return (
                      <td key={talle} className="px-2 py-3 text-right">
                        <input
                          className={`campo tabular w-24 py-1.5 text-right text-sm${
                            tocado ? ' campo-tocado' : ''
                          }`}
                          inputMode="numeric"
                          aria-label={`Precio de ${a.nombre}, talle ${talle}`}
                          value={valor}
                          placeholder="—"
                          onChange={(e) => tipear(a, talle, e.target.value)}
                        />
                      </td>
                    );
                  })}

                  <td className="px-4 py-3">
                    {cambios.length > 0 ? (
                      confirmando === a.id ? (
                        <div className="precios-confirmar">
                          <p>
                            {cambios.map((c) => (
                              <span key={c.talle}>
                                <b>{c.talle}</b>{' '}
                                {c.antes ? formatearPesos(Number(c.antes) * 100) : 'sin precio'} →{' '}
                                {formatearPesos(Number(c.ahora) * 100)}
                              </span>
                            ))}
                          </p>
                          <div className="flex gap-2">
                            <button
                              className="boton-principal py-1.5 text-xs"
                              disabled={guardando === a.id}
                              onClick={() => void guardarPrecios(a)}
                            >
                              {guardando === a.id ? 'Guardando…' : 'Sí, guardar'}
                            </button>
                            <button
                              className="boton-secundario py-1.5 text-xs"
                              onClick={() => descartar(a.id)}
                            >
                              Descartar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="boton-secundario py-1.5 text-xs"
                          onClick={() => setConfirmando(a.id)}
                        >
                          Guardar {cambios.length} {cambios.length === 1 ? 'precio' : 'precios'}
                        </button>
                      )
                    ) : (
                      a.precios[0]?.actualizadoPor && (
                        <small className="text-xs text-slate-500">
                          {a.precios[0].actualizadoPor} · {fechaCorta(a.precios[0].actualizadoEn)}
                        </small>
                      )
                    )}
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
              );
            })}
            {articulos.length === 0 && (
              <tr>
                <td colSpan={TALLES.length + 4} className="px-4 py-10 text-center text-slate-500">
                  Todavía no hay artículos. Agregá los que más se venden: son los botones
                  que va a tocar la vendedora al cobrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-slate-500">
        Los precios son números enteros de pesos. Cambiarlos no toca las ventas ya
        registradas: cada venta guardó el precio del momento.
        {ultimoCambio?.actualizadoPor && (
          <> Último cambio: {ultimoCambio.actualizadoPor}, {fechaCorta(ultimoCambio.actualizadoEn)}.</>
        )}
      </p>
    </div>
  );
}
