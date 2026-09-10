/**
 * Panel de administración: configuración del programa, movimientos y el pasivo.
 * Cambiar la tasa o el tope acá no requiere tocar código ni redeployar (D-009).
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';

type Configuracion = {
  valorPuntoTexto: string;
  topeCanjePorcentaje: number;
  diasAvisoVencimiento: number;
  temporada: { id: string; nombre: string; cierreEn: string };
  tasas: Array<{ lineaDeNegocio: string; texto: string | null }>;
};

type Totales = {
  temporada: { nombre: string; cierreEn: string };
  emitidos: number;
  canjeados: number;
  vencidos: number;
  revertidos: number;
  vigentes: number;
  pasivoTexto: string;
  clientes: number;
  cuentasConSaldo: number;
};

type MovimientoAdmin = {
  id: string;
  fecha: string;
  tipo: string;
  puntos: number;
  montoTexto: string | null;
  cliente: string;
  telefono: string;
  local: string | null;
  usuario: string | null;
  motivo: string | null;
};

const LINEAS: Record<string, string> = {
  UNIFORMES: 'Uniformes',
  ROPA_LISA: 'Ropa lisa',
  EGRESADOS: 'Egresados (todavía no participa)',
};

const soloNumero = (texto: string) => texto.replace(/[^\d,.]/g, '');

export function Admin() {
  const [pestania, setPestania] = useState<'config' | 'movimientos' | 'totales'>('totales');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Panel</h1>

      <div className="flex gap-2">
        {(
          [
            ['totales', 'Totales'],
            ['movimientos', 'Movimientos'],
            ['config', 'Configuración'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            onClick={() => setPestania(valor)}
            className={`chip border ${
              pestania === valor
                ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                : 'border-[var(--color-borde)] bg-white text-slate-700'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {pestania === 'totales' && <PanelTotales />}
      {pestania === 'movimientos' && <PanelMovimientos />}
      {pestania === 'config' && <PanelConfiguracion />}
    </div>
  );
}

function PanelTotales() {
  const [datos, setDatos] = useState<Totales | null>(null);
  useEffect(() => {
    api<Totales>('/admin/totales').then(setDatos).catch(() => setDatos(null));
  }, []);

  if (!datos) return <p className="text-slate-500">Cargando…</p>;

  const tarjetas = [
    { texto: 'Puntos emitidos', valor: datos.emitidos },
    { texto: 'Canjeados', valor: datos.canjeados },
    { texto: 'Vencidos', valor: datos.vencidos },
    { texto: 'Anulados', valor: datos.revertidos },
  ];

  return (
    <div className="space-y-4">
      <div className="tarjeta">
        <p className="text-sm text-slate-600">
          Pasivo del programa · {datos.temporada.nombre}
        </p>
        <p className="tabular mt-1 text-4xl font-bold text-[var(--color-marino)]">
          {datos.pasivoTexto}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {datos.vigentes} punto{datos.vigentes === 1 ? '' : 's'} vigentes en{' '}
          {datos.cuentasConSaldo} cuenta{datos.cuentasConSaldo === 1 ? '' : 's'} · {datos.clientes}{' '}
          cliente{datos.clientes === 1 ? '' : 's'} en el programa
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.texto} className="tarjeta">
            <p className="text-xs uppercase tracking-wide text-slate-500">{t.texto}</p>
            <p className="tabular mt-1 text-2xl font-bold">{t.valor}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelMovimientos() {
  const [movimientos, setMovimientos] = useState<MovimientoAdmin[]>([]);
  const [locales, setLocales] = useState<Array<{ id: string; nombre: string }>>([]);
  const [filtros, setFiltros] = useState({ localId: '', desde: '', hasta: '', telefono: '' });
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);

  useEffect(() => {
    api<{ locales: Array<{ id: string; nombre: string }> }>('/admin/locales')
      .then((d) => setLocales(d.locales))
      .catch(() => setLocales([]));
  }, []);

  useEffect(() => {
    const parametros = new URLSearchParams({ pagina: String(pagina) });
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor) parametros.set(clave, valor);
    }
    api<{ movimientos: MovimientoAdmin[]; paginas: number }>(
      `/admin/movimientos?${parametros.toString()}`,
    )
      .then((d) => {
        setMovimientos(d.movimientos);
        setPaginas(d.paginas);
      })
      .catch(() => setMovimientos([]));
  }, [filtros, pagina]);

  return (
    <div className="space-y-3">
      <div className="tarjeta grid gap-3 sm:grid-cols-4">
        <select
          className="campo"
          value={filtros.localId}
          onChange={(e) => {
            setPagina(1);
            setFiltros({ ...filtros, localId: e.target.value });
          }}
        >
          <option value="">Todos los locales</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
        <input
          className="campo"
          type="date"
          value={filtros.desde}
          onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
        />
        <input
          className="campo"
          type="date"
          value={filtros.hasta}
          onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
        />
        <input
          className="campo"
          placeholder="Teléfono del cliente"
          inputMode="tel"
          value={filtros.telefono}
          onChange={(e) => setFiltros({ ...filtros, telefono: e.target.value })}
        />
      </div>

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Puntos</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-borde)]">
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {new Date(m.fecha).toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{m.cliente}</p>
                  <p className="text-xs text-slate-500">{m.telefono}</p>
                </td>
                <td className="px-4 py-3">{m.tipo}</td>
                <td
                  className={`tabular px-4 py-3 text-right font-semibold ${
                    m.puntos > 0 ? 'text-[var(--color-ok)]' : 'text-slate-600'
                  }`}
                >
                  {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
                </td>
                <td className="tabular px-4 py-3 text-right">{m.montoTexto ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{m.local ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{m.usuario ?? '—'}</td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No hay movimientos con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            className="boton-secundario"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-sm text-slate-600">
            Página {pagina} de {paginas}
          </span>
          <button
            className="boton-secundario"
            disabled={pagina >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

function PanelConfiguracion() {
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [formulario, setFormulario] = useState({
    valorPunto: '',
    topeCanjePorcentaje: '',
    diasAvisoVencimiento: '',
    cierreTemporada: '',
    tasas: {} as Record<string, string>,
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const datos = await api<Configuracion>('/admin/configuracion');
    setConfig(datos);
    setFormulario({
      valorPunto: soloNumero(datos.valorPuntoTexto),
      topeCanjePorcentaje: String(datos.topeCanjePorcentaje),
      diasAvisoVencimiento: String(datos.diasAvisoVencimiento),
      cierreTemporada: datos.temporada.cierreEn.slice(0, 10),
      tasas: Object.fromEntries(
        datos.tasas.map((t) => [t.lineaDeNegocio, soloNumero(t.texto ?? '')]),
      ),
    });
  }

  useEffect(() => {
    cargar().catch(() => setError('No se pudo cargar la configuración'));
  }, []);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api('/admin/configuracion', {
        metodo: 'PUT',
        cuerpo: {
          valorPunto: formulario.valorPunto,
          topeCanjePorcentaje: Number(formulario.topeCanjePorcentaje.replace(',', '.')),
          diasAvisoVencimiento: Number(formulario.diasAvisoVencimiento),
          cierreTemporada: new Date(`${formulario.cierreTemporada}T23:59:59`).toISOString(),
          tasas: Object.entries(formulario.tasas)
            .filter(([, valor]) => valor.trim() !== '')
            .map(([lineaDeNegocio, pesosPorPunto]) => ({ lineaDeNegocio, pesosPorPunto })),
        },
      });
      await cargar();
      setMensaje('Guardado. Rige desde ahora; los movimientos anteriores no cambian.');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (!config) return <p className="text-slate-500">Cargando…</p>;

  return (
    <form className="tarjeta space-y-5" onSubmit={guardar}>
      <div>
        <h2 className="font-semibold">Acumulación</h2>
        <p className="mb-3 text-sm text-slate-600">
          Cuántos pesos en efectivo hacen falta para sumar un punto, por línea.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {config.tasas.map((t) => (
            <div key={t.lineaDeNegocio}>
              <label className="etiqueta">{LINEAS[t.lineaDeNegocio] ?? t.lineaDeNegocio}</label>
              <input
                className="campo tabular"
                inputMode="decimal"
                value={formulario.tasas[t.lineaDeNegocio] ?? ''}
                onChange={(e) =>
                  setFormulario({
                    ...formulario,
                    tasas: {
                      ...formulario.tasas,
                      [t.lineaDeNegocio]: soloNumero(e.target.value),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="etiqueta">Valor del punto (pesos)</label>
          <input
            className="campo tabular"
            inputMode="decimal"
            value={formulario.valorPunto}
            onChange={(e) => setFormulario({ ...formulario, valorPunto: soloNumero(e.target.value) })}
          />
        </div>
        <div>
          <label className="etiqueta">Tope de canje (% de la compra)</label>
          <input
            className="campo tabular"
            inputMode="decimal"
            value={formulario.topeCanjePorcentaje}
            onChange={(e) =>
              setFormulario({ ...formulario, topeCanjePorcentaje: soloNumero(e.target.value) })
            }
          />
        </div>
        <div>
          <label className="etiqueta">Aviso de vencimiento (días antes)</label>
          <input
            className="campo tabular"
            inputMode="numeric"
            value={formulario.diasAvisoVencimiento}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                diasAvisoVencimiento: e.target.value.replace(/\D/g, ''),
              })
            }
          />
        </div>
      </div>

      <div>
        <label className="etiqueta">Cierre de temporada ({config.temporada.nombre})</label>
        <input
          className="campo"
          type="date"
          value={formulario.cierreTemporada}
          onChange={(e) => setFormulario({ ...formulario, cierreTemporada: e.target.value })}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Ese día vencen los puntos de la temporada. El vencimiento queda registrado como
          movimiento; el historial no se borra.
        </p>
      </div>

      {mensaje && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-[var(--color-ok)]">{mensaje}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>
      )}

      <button className="boton-principal" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </form>
  );
}
