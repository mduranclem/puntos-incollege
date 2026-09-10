/**
 * Saldo del cliente. Se abre desde un link de WhatsApp, en el celular, sin login.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ErrorApi } from '../api';

type SaldoPublico = {
  nombre: string;
  saldoPuntos: number;
  equivalenteTexto: string;
  faltaParaElProximoTexto: string;
  topeCanjeBps: number;
  temporada: { nombre: string; venceEn: string };
  movimientos: Array<{
    fecha: string;
    tipo: string;
    puntos: number;
    montoTexto: string | null;
    local: string | null;
  }>;
};

const TEXTO_TIPO: Record<string, string> = {
  ACREDITACION: 'Compra en efectivo',
  CANJE: 'Canje',
  VENCIMIENTO: 'Vencimiento',
  REVERSA: 'Anulación',
  AJUSTE: 'Ajuste',
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

export function Saldo() {
  const { token } = useParams();
  const [datos, setDatos] = useState<SaldoPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SaldoPublico>(`/publico/saldo/${token}`, { publico: true })
      .then(setDatos)
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : 'No pudimos abrir tu saldo'),
      );
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <p className="mt-2 text-sm text-slate-600">
            Pedí un link nuevo en cualquiera de nuestros locales.
          </p>
        </div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-slate-500">Cargando tu saldo…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-marino)]">
      <div className="mx-auto max-w-md px-4 pb-10 pt-8">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-white/60">
          Puntos InCollege
        </p>

        <section className="mt-5 rounded-3xl bg-white p-6 text-center shadow-xl">
          <p className="text-slate-600">Hola {datos.nombre.split(' ')[0]},</p>
          <p className="tabular mt-3 text-7xl font-bold leading-none text-[var(--color-marino)]">
            {datos.saldoPuntos}
          </p>
          <p className="mt-2 text-lg font-medium">
            punto{datos.saldoPuntos === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-slate-600">
            equivalen a <strong className="text-[var(--color-tinta)]">{datos.equivalenteTexto}</strong> de
            descuento
          </p>

          {datos.faltaParaElProximoTexto !== '$0' && (
            <p className="mt-4 rounded-xl bg-[var(--color-punto-suave)] px-4 py-3 text-sm">
              Te faltan <strong>{datos.faltaParaElProximoTexto}</strong> en efectivo para sumar tu
              próximo punto.
            </p>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Vencen el {fechaLarga(datos.temporada.venceEn)}
          </p>
        </section>

        <section className="mt-4 rounded-3xl bg-white p-5 shadow-xl">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Últimos movimientos
          </h2>
          {datos.movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Todavía no tenés movimientos. Sumás puntos pagando en efectivo en el local.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-borde)]">
              {datos.movimientos.map((m, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {TEXTO_TIPO[m.tipo] ?? m.tipo}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fecha(m.fecha)}
                      {m.montoTexto ? ` · ${m.montoTexto}` : ''}
                      {m.local ? ` · ${m.local}` : ''}
                    </p>
                  </div>
                  <span
                    className={`tabular ml-auto text-lg font-semibold ${
                      m.puntos > 0 ? 'text-[var(--color-ok)]' : 'text-slate-500'
                    }`}
                  >
                    {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-4 rounded-3xl bg-white/10 p-5 text-sm text-white/85">
          <h2 className="mb-2 font-semibold text-white">Cómo funciona</h2>
          <ul className="space-y-1.5">
            <li>Sumás puntos pagando en efectivo en cualquiera de nuestros locales.</li>
            <li>
              Los canjeás por descuento, hasta el {datos.topeCanjeBps / 100}% de la compra.
            </li>
            <li>El canje no se junta con otras promociones.</li>
            <li>Mostrá tu teléfono en el mostrador: con eso alcanza.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
