/**
 * Cambio de la propia contraseña (D-034).
 *
 * La misma pantalla sirve para los dos casos: el obligatorio —la contraseña la
 * puso la gerencia o el seed, y hasta cambiarla el sistema no deja operar— y el
 * voluntario, desde el menú. Cuando es obligatorio no hay forma de saltearlo:
 * no se muestra "volver" y el servidor tampoco deja cobrar.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, guardarSesion, leerSesion, cerrarSesion, type Sesion } from '../api';

/** Las mismas reglas que el servidor, para avisar mientras se escribe. */
const LARGO_MINIMO = 8;
const LARGO_MINIMO_SOLO_NUMEROS = 10;

function motivoLocal(nueva: string, usuario: string): string | null {
  if (nueva.length === 0) return null;
  if (nueva !== nueva.trim()) return 'No puede empezar ni terminar con un espacio.';
  if (nueva.length < LARGO_MINIMO) return `Te faltan ${LARGO_MINIMO - nueva.length} caracteres.`;
  if (/^\d+$/.test(nueva) && nueva.length < LARGO_MINIMO_SOLO_NUMEROS) {
    return `Si son sólo números tienen que ser al menos ${LARGO_MINIMO_SOLO_NUMEROS}. Mejor: usá palabras.`;
  }
  if (new Set(nueva).size === 1) return 'No puede ser el mismo carácter repetido.';
  if (usuario && nueva.toLowerCase().includes(usuario.toLowerCase())) {
    return 'No puede contener tu nombre de usuario.';
  }
  return null;
}

export function CambiarContrasena() {
  const sesion = leerSesion();
  const obligatorio = Boolean(sesion?.debeCambiarContrasena);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const primerCampo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => primerCampo.current?.focus(), []);

  const aviso = motivoLocal(nueva, sesion?.usuario ?? '');
  const coinciden = nueva.length > 0 && nueva === repetida;
  const puedeGuardar = !cargando && actual.length > 0 && !aviso && coinciden;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const datos = await api<{ token: string; sesion: Sesion }>('/auth/contrasena', {
        cuerpo: { contrasenaActual: actual, contrasenaNueva: nueva },
      });
      // El token viejo lleva adentro la marca de cambio pendiente: hay que
      // reemplazarlo, si no el servidor sigue sin dejar operar.
      guardarSesion(datos.token, datos.sesion);
      navegar('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
      setActual('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-marino)] px-4 py-8">
      <form onSubmit={guardar} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold tracking-tight">
          {obligatorio ? 'Poné tu contraseña' : 'Cambiar contraseña'}
        </h1>
        <p className="mt-1 mb-5 text-sm text-slate-600">
          {obligatorio
            ? 'La que usaste hasta ahora la sabe otra persona. Elegí una tuya para poder seguir.'
            : `Estás cambiando la contraseña de ${sesion?.usuario ?? 'tu usuario'}.`}
        </p>

        <label className="etiqueta" htmlFor="actual">
          Contraseña actual
        </label>
        <input
          id="actual"
          ref={primerCampo}
          className="campo"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />

        <label className="etiqueta mt-4" htmlFor="nueva">
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            id="nueva"
            className="campo pr-16"
            type={ver ? 'text' : 'password'}
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-800"
            aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {ver ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {aviso ?? 'Al menos 8 caracteres. Una frase que te acuerdes sirve mejor que algo raro.'}
        </p>

        <label className="etiqueta mt-4" htmlFor="repetida">
          Repetila
        </label>
        <input
          id="repetida"
          className="campo"
          type={ver ? 'text' : 'password'}
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
        {repetida.length > 0 && !coinciden && (
          <p className="mt-1 text-xs text-[var(--color-error)]">Las dos no coinciden.</p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}

        <button className="boton-principal mt-5 w-full" disabled={!puedeGuardar}>
          {cargando ? 'Guardando…' : 'Guardar'}
        </button>

        {obligatorio ? (
          <button
            type="button"
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-800"
            onClick={() => {
              cerrarSesion();
              navegar('/ingresar', { replace: true });
            }}
          >
            Salir
          </button>
        ) : (
          <button
            type="button"
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-800"
            onClick={() => navegar('/', { replace: true })}
          >
            Volver
          </button>
        )}
      </form>
    </div>
  );
}
