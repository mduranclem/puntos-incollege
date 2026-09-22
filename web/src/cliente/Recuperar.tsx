/**
 * "Me olvidé la contraseña" (D-036).
 *
 * El código va por WhatsApp al teléfono de la cuenta, no al mail. Es a
 * propósito: el teléfono es la cuenta (D-010), así que ni siquiera alguien que
 * entró al mail de la clienta puede quedarse con sus puntos.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCliente, ErrorCliente, guardarAcceso } from './api';
import { Logo } from '../componentes/Logo';

type Paso = 'mail' | 'codigo';

function motivoContrasena(clave: string): string | null {
  if (clave.length === 0) return null;
  if (clave !== clave.trim()) return 'No puede empezar ni terminar con un espacio.';
  if (clave.length < 8) return `Te faltan ${8 - clave.length} caracteres.`;
  if (/^\d+$/.test(clave) && clave.length < 10) {
    return 'Si son sólo números tienen que ser al menos 10. Mejor: usá palabras.';
  }
  if (new Set(clave).size === 1) return 'No puede ser el mismo carácter repetido.';
  return null;
}

export function RecuperarCliente() {
  const [paso, setPaso] = useState<Paso>('mail');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    campo.current?.focus();
  }, [paso]);

  const aviso = motivoContrasena(contrasena);

  async function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    if (!email.trim() || cargando) return;
    setCargando(true);
    setError(null);
    try {
      await apiCliente('/cuenta/recuperar', { cuerpo: { email: email.trim().toLowerCase() } });
      setPaso('codigo');
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos enviarte el código.');
    } finally {
      setCargando(false);
    }
  }

  async function restablecer(evento: React.FormEvent) {
    evento.preventDefault();
    if (codigo.length < 4 || !contrasena || aviso || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const r = await apiCliente<{ token: string }>('/cuenta/restablecer', {
        cuerpo: { email: email.trim().toLowerCase(), codigo, contrasena },
      });
      guardarAcceso(r.token);
      navegar('/app', { replace: true });
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos cambiar la contraseña.');
      setCodigo('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="ingreso-cliente">
      <div className="ingreso-caja">
        <Logo alto={44} alt="" className="ingreso-logo" />
        <h1 className="ingreso-titulo">Recuperar tu cuenta</h1>

        {paso === 'mail' ? (
          <form onSubmit={pedir} noValidate>
            <p className="ingreso-texto">
              Poné tu mail y te mandamos un código por WhatsApp al teléfono de tu cuenta.
            </p>

            <label className="ingreso-etiqueta" htmlFor="rec-email">
              Tu mail
            </label>
            <input
              id="rec-email"
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

            {error && <p className="ingreso-error">{error}</p>}

            <button className="ingreso-boton" disabled={cargando || !email.trim()}>
              {cargando ? 'Enviando…' : 'Enviarme el código'}
            </button>

            <Link className="ingreso-volver block" to="/app/entrar">
              Volver
            </Link>
          </form>
        ) : (
          <form onSubmit={restablecer} noValidate>
            {/* No se dice a qué número salió: la respuesta del servidor es la
                misma exista o no la cuenta, así nadie averigua quién es cliente
                probando mails (D-022, D-036). */}
            <p className="ingreso-texto">
              Si ese mail tiene cuenta, el código ya salió por WhatsApp al teléfono que
              tenés registrado.
            </p>

            <label className="ingreso-etiqueta" htmlFor="rec-codigo">
              Código
            </label>
            <input
              id="rec-codigo"
              ref={campo}
              className="ingreso-campo ingreso-campo-codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="······"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />

            <label className="ingreso-etiqueta mt-4" htmlFor="rec-contrasena">
              Contraseña nueva
            </label>
            <div className="relative">
              <input
                id="rec-contrasena"
                className="ingreso-campo ingreso-campo-texto pr-16"
                type={ver ? 'text' : 'password'}
                autoComplete="new-password"
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
            <p className="ingreso-ayuda">
              {aviso ?? 'Al menos 8 caracteres.'}
            </p>

            {error && <p className="ingreso-error">{error}</p>}

            <button
              className="ingreso-boton"
              disabled={cargando || codigo.length < 4 || !contrasena || Boolean(aviso)}
            >
              {cargando ? 'Guardando…' : 'Cambiar y entrar'}
            </button>

            <button
              type="button"
              className="ingreso-volver"
              onClick={() => {
                setPaso('mail');
                setError(null);
              }}
            >
              Usar otro mail
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
