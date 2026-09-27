/**
 * Elegir qué se vendió, en el mostrador (D-027, rediseñado en D-043).
 *
 * La vendedora toca el artículo y el sistema pone el precio: no tipea importes.
 * Por eso cargar el detalle sale más rápido que escribir el total a mano.
 *
 * **Por qué el buscador y no la grilla abierta.** Con el catálogo entero
 * desplegado, la pantalla se llena de botones y hay que buscar con la vista
 * entre treinta cosas. Escribir "cam" y que queden dos es más rápido que
 * recorrer la grilla, y además deja la pantalla tranquila mientras no se usa.
 * La grilla completa sigue estando, plegada, para cuando se quiere mirar todo.
 *
 * Para lo que no está en la lista está "Otro", que sí pide nombre y precio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, formatearPesos, totalDeItems, type Articulo, type ItemElegido } from '../api';

const NOMBRE_LINEA: Record<string, string> = {
  UNIFORMES: 'Uniformes',
  ROPA_LISA: 'Ropa lisa',
  EGRESADOS: 'Egresados',
};

const nuevaClave = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Sin acentos y en minúsculas: "chomba" tiene que encontrar "Chómba". */
const plano = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function SelectorDeArticulos({
  items,
  alCambiar,
  titulo = 'Qué se vendió',
}: {
  items: ItemElegido[];
  alCambiar: (items: ItemElegido[]) => void;
  titulo?: string;
}) {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [verTodos, setVerTodos] = useState(false);
  const [otroAbierto, setOtroAbierto] = useState(false);
  const [otroNombre, setOtroNombre] = useState('');
  const [otroPrecio, setOtroPrecio] = useState('');
  const campoBusqueda = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ articulos: Articulo[] }>('/articulos')
      .then((d) => setArticulos(d.articulos))
      .catch(() => setArticulos([]));
  }, []);

  const encontrados = useMemo(() => {
    const q = plano(busqueda.trim());
    if (!q) return [];
    return articulos.filter(
      (a) => plano(a.nombre).includes(q) || plano(a.detalle ?? '').includes(q),
    );
  }, [articulos, busqueda]);

  function agregar(articulo: Articulo) {
    const yaEsta = items.find((i) => i.articuloId === articulo.id);
    if (yaEsta) {
      alCambiar(
        items.map((i) => (i.clave === yaEsta.clave ? { ...i, cantidad: i.cantidad + 1 } : i)),
      );
    } else {
      alCambiar([
        ...items,
        {
          clave: nuevaClave(),
          articuloId: articulo.id,
          descripcion: articulo.nombre,
          cantidad: 1,
          precioUnitarioCentavos: Number(articulo.precioCentavos),
          // Se guarda para poder deducir la línea de la venta sin preguntarla.
          lineaDeNegocio: articulo.lineaDeNegocio ?? undefined,
        },
      ]);
    }
    // Listo para el siguiente: se limpia la búsqueda y el foco se queda acá.
    setBusqueda('');
    campoBusqueda.current?.focus();
  }

  function cambiarCantidad(clave: string, delta: number) {
    alCambiar(
      items
        .map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0),
    );
  }

  function agregarOtro(evento: React.FormEvent) {
    evento.preventDefault();
    const nombre = otroNombre.trim();
    const pesos = Number(otroPrecio.replace(/\./g, '').replace(',', '.'));
    if (!nombre || !Number.isFinite(pesos) || pesos <= 0) return;
    alCambiar([
      ...items,
      {
        clave: nuevaClave(),
        descripcion: nombre,
        cantidad: 1,
        precioUnitarioCentavos: Math.round(pesos * 100),
      },
    ]);
    setOtroNombre('');
    setOtroPrecio('');
    setOtroAbierto(false);
  }

  const porLinea = new Map<string, Articulo[]>();
  for (const a of articulos) {
    const clave = a.lineaDeNegocio ?? 'OTRAS';
    porLinea.set(clave, [...(porLinea.get(clave) ?? []), a]);
  }

  const Boton = ({ a }: { a: Articulo }) => (
    <button type="button" className="art-boton" onClick={() => agregar(a)}>
      <span className="art-boton-nombre">{a.nombre}</span>
      <span className="art-boton-precio">{a.precioTexto}</span>
    </button>
  );

  return (
    <div>
      <span className="etiqueta">{titulo}</span>

      <div className="art-buscador">
        <input
          ref={campoBusqueda}
          className="campo"
          type="search"
          placeholder="Buscar artículo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            // Enter agrega el primero de la lista: escribir y darle enter
            // alcanza, sin sacar la mano del teclado.
            if (e.key === 'Enter') {
              e.preventDefault();
              if (encontrados[0]) agregar(encontrados[0]);
            }
            if (e.key === 'Escape') setBusqueda('');
          }}
        />
        <button
          type="button"
          className="art-ver-todos"
          onClick={() => setVerTodos((v) => !v)}
          aria-expanded={verTodos}
        >
          {verTodos ? 'Ocultar lista' : `Ver todos (${articulos.length})`}
        </button>
      </div>

      {busqueda.trim() !== '' && (
        <div className="art-botones art-resultados">
          {encontrados.length > 0 ? (
            encontrados.map((a) => <Boton key={a.id} a={a} />)
          ) : (
            <p className="art-sin-resultados">
              Nada con “{busqueda.trim()}”. Podés cargarlo con “Otro artículo”.
            </p>
          )}
        </div>
      )}

      {verTodos &&
        busqueda.trim() === '' &&
        [...porLinea.entries()].map(([linea, delGrupo]) => (
          <div key={linea} className="art-grupo">
            <p className="art-grupo-titulo">{NOMBRE_LINEA[linea] ?? 'Otros'}</p>
            <div className="art-botones">
              {delGrupo.map((a) => (
                <Boton key={a.id} a={a} />
              ))}
            </div>
          </div>
        ))}

      {!otroAbierto ? (
        <button type="button" className="art-otro" onClick={() => setOtroAbierto(true)}>
          + Otro artículo
        </button>
      ) : (
        <div className="art-otro-caja">
          <input
            className="campo"
            placeholder="Qué vendiste"
            value={otroNombre}
            autoFocus
            onChange={(e) => setOtroNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregarOtro(e)}
          />
          <input
            className="campo"
            placeholder="Precio"
            inputMode="decimal"
            value={otroPrecio}
            onChange={(e) => setOtroPrecio(e.target.value.replace(/[^\d.,]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && agregarOtro(e)}
          />
          <button type="button" className="boton-secundario" onClick={agregarOtro}>
            Agregar
          </button>
          <button
            type="button"
            className="art-cancelar"
            onClick={() => {
              setOtroAbierto(false);
              setOtroNombre('');
              setOtroPrecio('');
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="art-carrito">
          {items.map((i) => (
            <li key={i.clave}>
              <span className="art-carrito-que">
                {i.descripcion}
                <small>{formatearPesos(i.precioUnitarioCentavos)} c/u</small>
              </span>
              <span className="art-cantidad">
                <button
                  type="button"
                  onClick={() => cambiarCantidad(i.clave, -1)}
                  aria-label={`Quitar uno de ${i.descripcion}`}
                >
                  −
                </button>
                <b>{i.cantidad}</b>
                <button
                  type="button"
                  onClick={() => cambiarCantidad(i.clave, 1)}
                  aria-label={`Agregar uno de ${i.descripcion}`}
                >
                  +
                </button>
              </span>
              <span className="art-carrito-sub">
                {formatearPesos(i.precioUnitarioCentavos * i.cantidad)}
              </span>
            </li>
          ))}
          <li className="art-carrito-total">
            <span>Total</span>
            <span>{formatearPesos(totalDeItems(items))}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
