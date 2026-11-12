/**
 * Panel de administración: configuración del programa, movimientos y el pasivo.
 * Cambiar la tasa o el tope acá no requiere tocar código ni redeployar (D-009).
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi, calcularRecargo, formatearPesos } from '../api';
import { PanelPersonal } from './admin/Personal';
import { PanelArticulos } from './admin/Articulos';
import { PanelRegistroDiario } from './admin/RegistroDiario';
import { PanelLocales } from './admin/Locales';

type Configuracion = {
  valorPuntoTexto: string;
  topeCanjePorcentaje: number;
  temporada: { id: string; nombre: string };
  tasas: Array<{ lineaDeNegocio: string; texto: string | null }>;
};

/** Una forma de pago con su recargo, para editarla desde el panel (D-061). */
type FormaDePagoAdmin = {
  codigo: string;
  nombre: string;
  recargoPorcentaje: number;
  recargoTexto: string;
  cuotas: number;
  activa: boolean;
  acredita: boolean;
};

type Totales = {
  temporada: { nombre: string };
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
  const [pestania, setPestania] = useState<
    'hoy' | 'totales' | 'movimientos' | 'articulos' | 'personal' | 'locales' | 'config'
  >('hoy');
  /**
   * Un aviso que no salió no se queja: el cliente simplemente no se entera y no
   * vuelve. Por eso el número no vive sólo adentro de la pestaña Programa, que
   * hay que acordarse de abrir, sino arriba de todo el panel (D-056).
   */
  const [fallidos, setFallidos] = useState(0);
  useEffect(() => {
    api<{ porEstado: Record<string, number> }>('/admin/avisos')
      .then((d) => setFallidos(d.porEstado.FALLIDO ?? 0))
      .catch(() => setFallidos(0));
  }, [pestania]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Panel</h1>

      {fallidos > 0 && pestania !== 'totales' && (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left"
          onClick={() => setPestania('totales')}
        >
          <span className="text-sm font-semibold text-[var(--color-error)]">
            {fallidos} aviso{fallidos === 1 ? '' : 's'} de WhatsApp sin entregar
          </span>
          <span className="ml-auto text-xs text-slate-600 underline">Ver y reintentar</span>
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['hoy', 'Hoy'],
            ['totales', 'Programa'],
            ['movimientos', 'Movimientos'],
            ['articulos', 'Artículos'],
            ['personal', 'Personal'],
            ['locales', 'Locales'],
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

      {pestania === 'hoy' && <PanelRegistroDiario />}
      {pestania === 'totales' && (
        <>
          <PanelTotales />
          <PanelAvisos />
        </>
      )}
      {pestania === 'movimientos' && <PanelMovimientos />}
      {pestania === 'articulos' && <PanelArticulos />}
      {pestania === 'personal' && <PanelPersonal />}
      {pestania === 'locales' && <PanelLocales />}
      {pestania === 'config' && (
        <>
          <PanelConfiguracion />
          <PanelRecargos />
        </>
      )}
    </div>
  );
}

function PanelTotales() {
  const [datos, setDatos] = useState<Totales | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Totales>('/admin/totales')
      .then(setDatos)
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los totales.'),
      );
  }, []);

  if (error) return <p className="aviso-error">{error}</p>;
  if (!datos) return <p className="text-slate-500">Cargando…</p>;

  const tarjetas = [
    { texto: 'Puntos emitidos', valor: datos.emitidos },
    { texto: 'Canjeados', valor: datos.canjeados },
    // Los puntos no vencen (D-058). La tarjeta aparece sólo si el libro mayor
    // tiene vencimientos viejos: mostrar un cero fijo sería ruido.
    ...(datos.vencidos > 0 ? [{ texto: 'Vencidos', valor: datos.vencidos }] : []),
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

/** Estado de la cola de avisos a n8n (D-014, D-017). */
function PanelAvisos() {
  const [datos, setDatos] = useState<{
    configurado: boolean;
    porEstado: Record<string, number>;
    ultimos: Array<{ id: string; tipo: string; estado: string; intentos: number; ultimoError: string | null }>;
  } | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargar = () =>
    api<never>('/admin/avisos').then(setDatos).catch(() => setDatos(null));

  useEffect(() => {
    void cargar();
  }, []);

  async function reintentar() {
    setReintentando(true);
    setResultado(null);
    try {
      const r = await api<{ reencolados: number; resultado: { enviados: number } | null }>(
        '/admin/avisos/reintentar',
        { cuerpo: {} },
      );
      setResultado(
        r.reencolados === 0
          ? 'No había avisos fallidos.'
          : `Se volvieron a encolar ${r.reencolados}. Entregados ahora: ${r.resultado?.enviados ?? 0}.`,
      );
      await cargar();
    } catch (e) {
      setResultado(e instanceof ErrorApi ? e.message : 'No se pudo reintentar');
    } finally {
      setReintentando(false);
    }
  }

  if (!datos) return null;

  return (
    <div className="tarjeta">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Avisos de WhatsApp</h2>
        <span
          className={`chip ${
            datos.configurado ? 'bg-green-50 text-[var(--color-ok)]' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {datos.configurado ? 'n8n conectado' : 'n8n sin configurar'}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Pendientes: {datos.porEstado.PENDIENTE ?? 0} · Entregados a n8n:{' '}
        {datos.porEstado.ENVIADO ?? 0} · Fallidos: {datos.porEstado.FALLIDO ?? 0}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        "Entregados a n8n" no quiere decir que el cliente lo haya recibido: de eso se
        encarga n8n, y ahí se mira si el WhatsApp llegó (D-031).
      </p>
      {(datos.porEstado.FALLIDO ?? 0) > 0 && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-[var(--color-error)]">
            {datos.porEstado.FALLIDO} aviso{datos.porEstado.FALLIDO === 1 ? '' : 's'} que no se
            pudieron entregar.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Agotaron sus seis reintentos y la cola ya no los vuelve a mirar. Arreglá primero
            la causa —casi siempre el webhook de n8n— y después volvé a encolarlos: si el
            problema sigue, van a fallar de nuevo.
          </p>
          {datos.ultimos.find((u) => u.estado === 'FALLIDO')?.ultimoError && (
            <p className="mt-2 break-words text-xs text-slate-500">
              Último error: {datos.ultimos.find((u) => u.estado === 'FALLIDO')!.ultimoError}
            </p>
          )}
          <button
            type="button"
            className="boton-secundario mt-3 py-2 text-sm"
            disabled={reintentando}
            onClick={() => void reintentar()}
          >
            {reintentando ? 'Reintentando…' : 'Volver a encolarlos'}
          </button>
        </div>
      )}
      {resultado && <p className="mt-2 text-sm text-slate-600">{resultado}</p>}
    </div>
  );
}

function PanelMovimientos() {
  const [movimientos, setMovimientos] = useState<MovimientoAdmin[]>([]);
  const [locales, setLocales] = useState<Array<{ id: string; nombre: string }>>([]);
  const [filtros, setFiltros] = useState({ localId: '', desde: '', hasta: '', telefono: '' });
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [error, setError] = useState<string | null>(null);

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
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los movimientos.'),
      );
  }, [filtros, pagina]);

  return (
    <div className="space-y-3">
      {error && <p className="aviso-error">{error}</p>}

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
      tasas: Object.fromEntries(
        datos.tasas.map((t) => [t.lineaDeNegocio, soloNumero(t.texto ?? '')]),
      ),
    });
  }

  useEffect(() => {
    cargar().catch((e) =>
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la configuración.'),
    );
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

  if (error && !config) return <p className="aviso-error">{error}</p>;
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

      <div className="grid gap-3 sm:grid-cols-2">
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

/**
 * Los recargos por forma de pago (D-061).
 *
 * Es su propia tarjeta y no un campo más de Configuración porque se toca cuando
 * cambian los aranceles de la tarjeta, que es otro momento y otra cabeza que
 * cuando se cambia el valor del punto.
 *
 * Se edita en su lugar: lo que hay que poder auditar es con qué recargo se cobró
 * cada venta, y eso queda guardado en cada pago.
 */
function PanelRecargos() {
  const [formas, setFormas] = useState<FormaDePagoAdmin[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const datos = await api<{ formas: FormaDePagoAdmin[] }>('/admin/formas-de-pago');
    setFormas(datos.formas);
    setValores(
      Object.fromEntries(datos.formas.map((f) => [f.codigo, String(f.recargoPorcentaje)])),
    );
  }

  useEffect(() => {
    cargar().catch((e) =>
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las formas de pago.'),
    );
  }, []);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      await api('/admin/formas-de-pago', {
        metodo: 'PUT',
        cuerpo: {
          formas: Object.entries(valores).map(([codigo, porcentaje]) => ({
            codigo,
            recargoPorcentaje: Number(porcentaje.replace(',', '.') || '0'),
          })),
        },
      });
      await cargar();
      setMensaje('Guardado. Rige desde el próximo cobro; lo cobrado antes no cambia.');
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  if (!formas) return null;

  /** La campera, que es la prenda más cara de la lista: el recargo se ve. */
  const EJEMPLO_CENTAVOS = 4_180_000;

  return (
    <form className="tarjeta mt-4 space-y-4" onSubmit={guardar}>
      <div>
        <h2 className="font-semibold">Recargo por forma de pago</h2>
        <p className="text-sm text-slate-600">
          Los precios de lista son de contado. Acá va cuánto se recarga según cómo pague, en
          porcentaje. El efectivo va en cero: es el único que suma puntos.
        </p>
      </div>

      <div className="space-y-2">
        {formas.map((f) => {
          const porcentaje = Number((valores[f.codigo] ?? '0').replace(',', '.')) || 0;
          const conRecargo =
            EJEMPLO_CENTAVOS + calcularRecargo(EJEMPLO_CENTAVOS, Math.round(porcentaje * 100));
          return (
            <div key={f.codigo} className="fila-recargo">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {f.nombre}
                  {f.acredita && <span className="conf-nuevo">suma puntos</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Una campera de {formatearPesos(EJEMPLO_CENTAVOS)} sale{' '}
                  <strong className="tabular">{formatearPesos(conRecargo)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <input
                  className="campo tabular w-20 text-right"
                  inputMode="decimal"
                  aria-label={`Recargo de ${f.nombre} en porcentaje`}
                  value={valores[f.codigo] ?? ''}
                  onChange={(e) =>
                    setValores({ ...valores, [f.codigo]: soloNumero(e.target.value) })
                  }
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
          );
        })}
      </div>

      {mensaje && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-[var(--color-ok)]">{mensaje}</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>
      )}

      <button className="boton-principal" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar recargos'}
      </button>
    </form>
  );
}
