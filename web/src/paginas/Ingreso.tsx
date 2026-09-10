import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion, type Sesion } from '../api';

export function Ingreso() {
  const [usuario, setUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const primerCampo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => primerCampo.current?.focus(), []);

  async function ingresar(evento: React.FormEvent) {
    evento.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const datos = await api<{ token: string; sesion: Sesion }>('/auth/ingresar', {
        cuerpo: { usuario: usuario.trim().toLowerCase(), pin },
      });
      guardarSesion(datos.token, datos.sesion);
      navegar('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ingresar');
      setPin('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-marino)] px-4">
      <form onSubmit={ingresar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold tracking-tight">
          Puntos <span className="text-[var(--color-punto)]">InCollege</span>
        </h1>
        <p className="mt-1 mb-5 text-sm text-slate-600">Ingresá con tu usuario de mostrador.</p>

        <label className="etiqueta" htmlFor="usuario">
          Usuario
        </label>
        <input
          id="usuario"
          ref={primerCampo}
          className="campo"
          autoComplete="username"
          autoCapitalize="none"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />

        <label className="etiqueta mt-4" htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          className="campo tabular tracking-[0.3em]"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        <button className="boton-principal mt-5 w-full" disabled={cargando || !usuario || !pin}>
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
