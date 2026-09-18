/**
 * Registro diario de ventas (D-027). Sólo gerencia.
 *
 * Responde "¿qué pasó hoy?" en cuatro cortes: cuánto entró, cómo le fue a cada
 * local, qué se vendió más, y el detalle operación por operación con los cobros
 * y los canjes en una sola línea de tiempo.
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../../api';

type Registro = {
  fecha: string;
  totales: {
    operaciones: number;
    cobradoTexto: string;
    descontadoEnCanjesTexto: string;
    puntosCanjeados: number;
    canjes: number;
    porMedioDePago: Array<{ medioDePago: string; cantidad: number; texto: string }>;
  };
  porLocal: Array<{
    nombre: string;
    operaciones: number;
    cobradoTexto: string;
    canjeadoTexto: string;
  }>;
  ranking: Array<{ descripcion: string; unidades: number; totalTexto: string }>;
  detalle: Array<{
    fecha: string;
    tipo: 'COBRO' | 'CANJE';
    quePasó: string;
    montoTexto: string;
    medioDePago: string | null;
    cliente: string;
    local: string;
    usuario: string | null;
    puntos?: number;
  }>;
};

const MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Débito',
  TARJETA_CREDITO: 'Crédito',
  QR: 'QR',
  BILLETERA_VIRTUAL: 'Billetera',
  OTRO: 'Otro',
};

/** La fecha de hoy en Argentina, para que el selector arranque en el día correcto. */
const hoyArgentina = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export function PanelRegistroDiario() {
  const [fecha, setFecha] = useState(hoyArgentina());
  const [datos, setDatos] = useState<Registro | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setError(null);
    api<Registro>(`/admin/registro-diario?fecha=${fecha}`)
      .then(setDatos)
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el registro del día.'),
      );
  }, [fecha]);

  const esHoy = fecha === hoyArgentina();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="etiqueta mb-0" htmlFor="rd-fecha">
          Día
        </label>
        <input
          id="rd-fecha"
          className="campo w-auto py-2"
          type="date"
          value={fecha}
          max={hoyArgentina()}
          onChange={(e) => setFecha(e.target.value)}
        />
        {!esHoy && (
          <button className="boton-secundario py-2" onClick={() => setFecha(hoyArgentina())}>
            Volver a hoy
          </button>
        )}
      </div>

      {error && <p className="aviso-error">{error}</p>}
      {!datos && !error && <p className="text-slate-500">Cargando…</p>}

      {datos && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="tarjeta">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cobrado</p>
              <p className="tabular mt-1 text-3xl font-bold text-[var(--color-marino)]">
                {datos.totales.cobradoTexto}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                en {datos.totales.operaciones}{' '}
                {datos.totales.operaciones === 1 ? 'operación' : 'operaciones'}
              </p>
            </div>
            <div className="tarjeta">
              <p className="text-xs uppercase tracking-wide text-slate-500">Descontado en canjes</p>
              <p className="tabular mt-1 text-3xl font-bold">
                {datos.totales.descontadoEnCanjesTexto}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {datos.totales.puntosCanjeados} punto
                {datos.totales.puntosCanjeados === 1 ? '' : 's'} en {datos.totales.canjes} canje
                {datos.totales.canjes === 1 ? '' : 's'}
              </p>
            </div>
            <div className="tarjeta">
              <p className="text-xs uppercase tracking-wide text-slate-500">Por medio de pago</p>
              {datos.totales.porMedioDePago.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Sin cobros todavía.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {datos.totales.porMedioDePago.map((m) => (
                    <li key={m.medioDePago} className="flex justify-between gap-3">
                      <span className="text-slate-600">{MEDIO[m.medioDePago] ?? m.medioDePago}</span>
                      <span className="tabular font-semibold">{m.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="tarjeta">
              <h3 className="mb-2 text-sm font-semibold">Cómo le fue a cada local</h3>
              <ul className="divide-y divide-[var(--color-borde)]">
                {datos.porLocal.map((l) => (
                  <li key={l.nombre} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="text-sm">
                      {l.nombre}
                      <small className="block text-xs text-slate-500">
                        {l.operaciones} {l.operaciones === 1 ? 'operación' : 'operaciones'}
                        {l.canjeadoTexto !== '$0' && ` · ${l.canjeadoTexto} en canjes`}
                      </small>
                    </span>
                    <span className="tabular font-semibold">{l.cobradoTexto}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="tarjeta">
              <h3 className="mb-2 text-sm font-semibold">Lo que más se vendió</h3>
              {datos.ranking.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">
                  Ninguna venta del día tiene el detalle cargado.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-borde)]">
                  {datos.ranking.map((r) => (
                    <li key={r.descripcion} className="flex items-baseline gap-3 py-2">
                      <span className="tabular w-8 text-lg font-bold text-[var(--color-marino)]">
                        {r.unidades}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.descripcion}</span>
                      <span className="tabular text-sm font-semibold">{r.totalTexto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="tarjeta overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3">Qué pasó</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Local</th>
                  <th className="px-4 py-3">Vendedora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-borde)]">
                {datos.detalle.map((d, i) => (
                  <tr key={i}>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-slate-600">
                      {hora(d.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`chip mr-2 ${
                          d.tipo === 'CANJE'
                            ? 'bg-[var(--color-punto-suave)]'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {d.tipo === 'CANJE' ? 'Canje' : MEDIO[d.medioDePago ?? ''] ?? 'Cobro'}
                      </span>
                      {d.quePasó}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {d.tipo === 'CANJE' ? `−${d.montoTexto}` : d.montoTexto}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{d.cliente}</td>
                    <td className="px-4 py-3 text-slate-600">{d.local}</td>
                    <td className="px-4 py-3 text-slate-600">{d.usuario ?? '—'}</td>
                  </tr>
                ))}
                {datos.detalle.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No hubo movimientos este día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
