/**
 * Datos de los locales que ve el cliente en la app: dirección, horarios y
 * teléfono. Sólo gerencia.
 *
 * Se guarda al salir de cada campo. Si un local no tiene dirección cargada, la
 * app lo muestra igual con su nombre: media ficha es mejor que una pantalla
 * vacía.
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../../api';

type Local = {
  id: string;
  nombre: string;
  direccion: string | null;
  horarios: string | null;
  telefono: string | null;
};

export function PanelLocales() {
  const [locales, setLocales] = useState<Local[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);

  async function cargar() {
    const d = await api<{ locales: Local[] }>('/admin/locales');
    setLocales(d.locales);
  }

  useEffect(() => {
    cargar().catch((e) =>
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar los locales.'),
    );
  }, []);

  async function guardar(id: string, campo: string, valor: string) {
    setError(null);
    try {
      await api(`/admin/locales/${id}`, { metodo: 'PATCH', cuerpo: { [campo]: valor } });
      setGuardado(id);
      setTimeout(() => setGuardado(null), 1500);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar.');
    }
  }

  if (error && !locales) return <p className="aviso-error">{error}</p>;
  if (!locales) return <p className="text-slate-500">Cargando…</p>;

  const sinDireccion = locales.filter((l) => !l.direccion);

  return (
    <div className="space-y-3">
      {error && <p className="aviso-error">{error}</p>}

      {sinDireccion.length > 0 && (
        <p className="aviso-falta">
          {sinDireccion.length === 1
            ? `${sinDireccion[0]!.nombre} no tiene dirección cargada.`
            : `${sinDireccion.length} locales no tienen dirección cargada.`}{' '}
          En la app del cliente aparecen con el nombre pero sin la ficha completa.
        </p>
      )}

      <div className="tarjeta overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Dirección</th>
              <th className="px-4 py-3">Horarios</th>
              <th className="px-4 py-3">Teléfono</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-borde)]">
            {locales.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {l.nombre}
                  {guardado === l.id && (
                    <span className="ml-2 text-xs font-normal text-[var(--color-ok)]">guardado</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    className="campo w-56 py-1.5 text-sm"
                    placeholder="Calle y número"
                    defaultValue={l.direccion ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (l.direccion ?? '')) {
                        void guardar(l.id, 'direccion', e.target.value);
                      }
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="campo w-44 py-1.5 text-sm"
                    placeholder="De 10 a 16 hs"
                    defaultValue={l.horarios ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (l.horarios ?? '')) {
                        void guardar(l.id, 'horarios', e.target.value);
                      }
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="campo w-40 py-1.5 text-sm"
                    placeholder="341 555 1234"
                    inputMode="tel"
                    defaultValue={l.telefono ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (l.telefono ?? '')) {
                        void guardar(l.id, 'telefono', e.target.value);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-slate-500">
        Se guarda al salir de cada campo. Esto es lo que el cliente ve en la pestaña
        Locales de su app.
      </p>
    </div>
  );
}
