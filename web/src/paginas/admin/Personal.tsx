/**
 * Alta y baja del personal (D-026). Sólo gerencia.
 *
 * Nadie se borra: se desactiva. Sus movimientos tienen que seguir apuntando a
 * alguien (D-004), y así también se puede reactivar a quien vuelve.
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../../api';

type Persona = {
  id: string;
  usuario: string;
  nombre: string;
  rol: 'VENDEDOR' | 'GERENTE';
  activo: boolean;
  local: { id: string; nombre: string };
};

type Local = { id: string; nombre: string };

type Alta = {
  usuario: string;
  nombre: string;
  pin: string;
  rol: 'VENDEDOR' | 'GERENTE';
  localId: string;
};

const vacio: Alta = { usuario: '', nombre: '', pin: '', rol: 'VENDEDOR', localId: '' };

export function PanelPersonal() {
  const [personal, setPersonal] = useState<Persona[] | null>(null);
  const [locales, setLocales] = useState<Local[]>([]);
  const [alta, setAlta] = useState<Alta>(vacio);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cambiandoPin, setCambiandoPin] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState('');

  async function cargar() {
    const [p, l] = await Promise.all([
      api<{ personal: Persona[] }>('/personal'),
      api<{ locales: Local[] }>('/admin/locales'),
    ]);
    setPersonal(p.personal);
    setLocales(l.locales);
    if (!alta.localId && l.locales[0]) setAlta((a) => ({ ...a, localId: l.locales[0]!.id }));
  }

  useEffect(() => {
    cargar().catch((e) =>
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el personal.'),
    );
  }, []);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      await api('/personal', { cuerpo: alta });
      setMensaje(`${alta.nombre} ya puede entrar con el usuario "${alta.usuario}".`);
      setAlta({ ...vacio, localId: alta.localId });
      setAbriendo(false);
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo dar de alta.');
    }
  }

  async function cambiar(id: string, cambios: Record<string, unknown>) {
    setError(null);
    setMensaje(null);
    try {
      await api(`/personal/${id}`, { metodo: 'PATCH', cuerpo: cambios });
      await cargar();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar el cambio.');
    }
  }

  if (error && !personal) return <p className="aviso-error">{error}</p>;
  if (!personal) return <p className="text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-3">
      {mensaje && <p className="aviso-ok">{mensaje}</p>}
      {error && <p className="aviso-error">{error}</p>}

      {!abriendo ? (
        <button className="boton-principal" onClick={() => setAbriendo(true)}>
          Agregar persona
        </button>
      ) : (
        <form className="tarjeta space-y-3" onSubmit={crear}>
          <h3 className="font-semibold">Nueva persona</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiqueta" htmlFor="p-nombre">
                Nombre y apellido
              </label>
              <input
                id="p-nombre"
                className="campo"
                value={alta.nombre}
                onChange={(e) => setAlta({ ...alta, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="p-usuario">
                Usuario para entrar
              </label>
              <input
                id="p-usuario"
                className="campo"
                autoCapitalize="none"
                placeholder="nombre.apellido"
                value={alta.usuario}
                onChange={(e) => setAlta({ ...alta, usuario: e.target.value.toLowerCase() })}
                required
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="p-pin">
                PIN (4 a 8 números)
              </label>
              <input
                id="p-pin"
                className="campo tabular"
                inputMode="numeric"
                value={alta.pin}
                onChange={(e) => setAlta({ ...alta, pin: e.target.value.replace(/\D/g, '') })}
                required
              />
            </div>
            <div>
              <label className="etiqueta" htmlFor="p-local">
                Local
              </label>
              <select
                id="p-local"
                className="campo"
                value={alta.localId}
                onChange={(e) => setAlta({ ...alta, localId: e.target.value })}
              >
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="etiqueta">Rol</span>
            <div className="flex gap-2">
              {(['VENDEDOR', 'GERENTE'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAlta({ ...alta, rol: r })}
                  className={`chip border ${
                    alta.rol === r
                      ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                      : 'border-[var(--color-borde)] bg-white text-slate-700'
                  }`}
                >
                  {r === 'VENDEDOR' ? 'Vendedor' : 'Gerente'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {alta.rol === 'VENDEDOR'
                ? 'Cobra y canjea en su local. No ve totales, ni movimientos, ni configuración.'
                : 'Ve y toca todo: totales del programa, movimientos de todos los locales, configuración y personal.'}
            </p>
          </div>

          <div className="flex gap-2">
            <button className="boton-principal">Dar de alta</button>
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
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Local</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-borde)]">
            {personal.map((p) => (
              <tr key={p.id} className={p.activo ? '' : 'opacity-55'}>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-slate-500">{p.usuario}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="campo py-1.5 text-sm"
                    value={p.local.id}
                    onChange={(e) => void cambiar(p.id, { localId: e.target.value })}
                  >
                    {locales.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="campo py-1.5 text-sm"
                    value={p.rol}
                    onChange={(e) => void cambiar(p.id, { rol: e.target.value })}
                  >
                    <option value="VENDEDOR">Vendedor</option>
                    <option value="GERENTE">Gerente</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {p.activo ? (
                    <span className="chip bg-green-50 text-[var(--color-ok)]">Activo</span>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-500">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {cambiandoPin === p.id ? (
                    <span className="flex items-center justify-end gap-2">
                      <input
                        className="campo tabular w-28 py-1.5 text-sm"
                        inputMode="numeric"
                        autoFocus
                        placeholder="PIN nuevo"
                        value={pinNuevo}
                        onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setCambiandoPin(null);
                          if (e.key === 'Enter' && pinNuevo.length >= 4) {
                            void cambiar(p.id, { pin: pinNuevo }).then(() => {
                              setCambiandoPin(null);
                              setPinNuevo('');
                              setMensaje(`Listo. ${p.nombre} entra con el PIN nuevo.`);
                            });
                          }
                        }}
                      />
                      <button
                        className="text-sm font-medium text-slate-500 underline"
                        onClick={() => {
                          setCambiandoPin(null);
                          setPinNuevo('');
                        }}
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <span className="flex justify-end gap-3">
                      <button
                        className="text-sm font-medium text-[var(--color-marino-claro)] underline"
                        onClick={() => {
                          setCambiandoPin(p.id);
                          setPinNuevo('');
                          setMensaje(null);
                        }}
                      >
                        Cambiar PIN
                      </button>
                      <button
                        className="text-sm font-medium text-[var(--color-marino-claro)] underline"
                        onClick={() => void cambiar(p.id, { activo: !p.activo })}
                      >
                        {p.activo ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs text-slate-500">
        Nadie se borra: se da de baja. Los movimientos que hizo siguen apuntando a su nombre.
      </p>
    </div>
  );
}
