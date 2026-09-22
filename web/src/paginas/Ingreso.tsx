import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi, api, guardarSesion, type Sesion } from '../api';
import { Logo } from '../componentes/Logo';

export function Ingreso() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [verContrasena, setVerContrasena] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [cargando, setCargando] = useState(false);
  const primerCampo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => primerCampo.current?.focus(), []);

  // Cuenta regresiva de la espera por intentos fallidos, para que el vendedor
  // vea cuánto falta en lugar de probar a ciegas.
  useEffect(() => {
    if (espera <= 0) return;
    const reloj = setInterval(() => setEspera((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(reloj);
  }, [espera]);

  async function ingresar(evento: React.FormEvent) {
    evento.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const datos = await api<{ token: string; sesion: Sesion }>('/auth/ingresar', {
        cuerpo: { usuario: usuario.trim().toLowerCase(), contrasena },
      });
      guardarSesion(datos.token, datos.sesion);
      navegar(datos.sesion.debeCambiarContrasena ? '/contrasena' : '/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ingresar');
      const segundos =
        e instanceof ErrorApi
          ? (e.detalle as { esperaSegundos?: number } | undefined)?.esperaSegundos
          : undefined;
      if (segundos) setEspera(segundos);
      setContrasena('');
    } finally {
      setCargando(false);
    }
  }

  const trabado = espera > 0;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-marino)] px-4">
      <form onSubmit={ingresar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <Logo alto={52} alt="" />
        <h1 className="mt-3 text-lg font-bold tracking-tight">Programa de puntos</h1>
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
          autoCorrect="off"
          spellCheck={false}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />

        <label className="etiqueta mt-4" htmlFor="contrasena">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="contrasena"
            className="campo pr-16"
            type={verContrasena ? 'text' : 'password'}
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setVerContrasena((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-800"
            aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {verContrasena ? 'Ocultar' : 'Ver'}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
            {trabado ? `Muchos intentos seguidos. Probá de nuevo en ${espera} s.` : error}
          </p>
        )}

        <button
          className="boton-principal mt-5 w-full"
          disabled={cargando || trabado || !usuario || !contrasena}
        >
          {cargando ? 'Entrando…' : trabado ? `Esperá ${espera} s` : 'Entrar'}
        </button>

        <p className="mt-4 text-xs text-slate-500">
          Si te la olvidaste, pedile a la gerencia que te la cambie desde el panel.
        </p>
      </form>
    </div>
  );
}
