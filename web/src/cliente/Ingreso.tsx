/**
 * Entrar a la cuenta con mail y contraseña (D-036).
 *
 * Es la puerta principal. El código por WhatsApp sigue estando, abajo, para
 * quien nunca se registró o se olvidó de todo: ahí el teléfono alcanza.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCliente, ErrorCliente, guardarAcceso } from './api';
import { Logo } from '../componentes/Logo';

export function IngresoCliente() {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => campo.current?.focus(), []);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      const datos = await apiCliente<{ token: string }>('/cuenta/ingresar', {
        cuerpo: { email: email.trim().toLowerCase(), contrasena },
      });
      guardarAcceso(datos.token);
      navegar('/app', { replace: true });
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos entrar. Probá de nuevo.');
      setContrasena('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="ingreso-cliente">
      <div className="ingreso-caja">
        <Logo alto={56} alt="InCollege" className="ingreso-logo" />

        <form onSubmit={entrar} noValidate>
          <p className="ingreso-texto">Entrá a tu cuenta para ver tus puntos.</p>

          <label className="ingreso-etiqueta" htmlFor="email-cliente">
            Tu mail
          </label>
          <input
            id="email-cliente"
            ref={campo}
            className="ingreso-campo ingreso-campo-texto"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tumail@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="ingreso-etiqueta mt-4" htmlFor="contrasena-cliente">
            Tu contraseña
          </label>
          <div className="relative">
            <input
              id="contrasena-cliente"
              className="ingreso-campo ingreso-campo-texto pr-16"
              type={ver ? 'text' : 'password'}
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500"
              aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {ver ? 'Ocultar' : 'Ver'}
            </button>
          </div>

          {error && <p className="ingreso-error">{error}</p>}

          <button
            className="ingreso-boton"
            disabled={cargando || !email.trim() || !contrasena}
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>

          <div className="ingreso-fila">
            <Link className="ingreso-enlace" to="/app/recuperar">
              Me olvidé la contraseña
            </Link>
            <Link className="ingreso-enlace" to="/app/registrarse">
              Crear cuenta
            </Link>
          </div>
        </form>

        <div className="ingreso-o">o</div>

        <Link className="ingreso-boton-suave block text-center" to="/app/entrar-con-codigo">
          Entrar con un código por WhatsApp
        </Link>
      </div>

      <p className="ingreso-pie">
        Si ya compraste pagando en efectivo, tus puntos están esperándote: creá la cuenta
        con el mismo teléfono que diste en el local y los vas a ver ahí.
      </p>
    </div>
  );
}
