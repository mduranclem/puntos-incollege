/**
 * Crear la cuenta de la app: mail, contraseña y teléfono (D-036).
 *
 * El teléfono se confirma con un código por WhatsApp. No es un trámite de más:
 * los puntos valen plata y están atados al teléfono (D-010), así que si
 * alcanzara con escribirlo, cualquiera podría poner el número de otro y quedarse
 * con sus puntos. Es una sola vez; después entra con mail y contraseña.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCliente, ErrorCliente, guardarAcceso } from './api';

type Paso = 'datos' | 'codigo';

/** Las mismas reglas que el servidor, para avisar mientras escribe. */
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

export function RegistroCliente() {
  const [paso, setPaso] = useState<Paso>('datos');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ver, setVer] = useState(false);
  const [telefonoLindo, setTelefonoLindo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    campo.current?.focus();
  }, [paso]);

  const aviso = motivoContrasena(contrasena);
  const listo = nombre.trim() && email.trim() && telefono.trim() && contrasena && !aviso;

  const datos = () => ({
    nombre: nombre.trim(),
    email: email.trim().toLowerCase(),
    contrasena,
    telefono,
  });

  async function pedirCodigo(evento: React.FormEvent) {
    evento.preventDefault();
    if (!listo || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const r = await apiCliente<{ telefonoLindo: string }>('/cuenta/registrar', {
        cuerpo: datos(),
      });
      setTelefonoLindo(r.telefonoLindo);
      setCodigo('');
      setPaso('codigo');
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos crear la cuenta.');
    } finally {
      setCargando(false);
    }
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (codigo.length < 4 || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const r = await apiCliente<{ token: string }>('/cuenta/confirmar', {
        cuerpo: { ...datos(), codigo },
      });
      guardarAcceso(r.token);
      navegar('/app', { replace: true });
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos verificar el código.');
      setCodigo('');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="ingreso-cliente">
      <div className="ingreso-caja">
        <div className="ingreso-estrella" aria-hidden="true">
          ★
        </div>
        <h1 className="ingreso-titulo">Crear tu cuenta</h1>

        {paso === 'datos' ? (
          <form onSubmit={pedirCodigo} noValidate>
            <p className="ingreso-texto">
              Si ya compraste en efectivo, poné el mismo teléfono que diste en el local:
              tus puntos ya están ahí esperándote.
            </p>

            <label className="ingreso-etiqueta" htmlFor="r-nombre">
              Tu nombre
            </label>
            <input
              id="r-nombre"
              ref={campo}
              className="ingreso-campo ingreso-campo-texto"
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <label className="ingreso-etiqueta mt-4" htmlFor="r-email">
              Tu mail
            </label>
            <input
              id="r-email"
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

            <label className="ingreso-etiqueta mt-4" htmlFor="r-telefono">
              Tu teléfono
            </label>
            <input
              id="r-telefono"
              className="ingreso-campo ingreso-campo-texto"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="341 555 1234"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
            <p className="ingreso-ayuda">
              Escribilo como quieras: con 0, con 15 o con guiones. Lo entendemos igual.
            </p>

            <label className="ingreso-etiqueta mt-4" htmlFor="r-contrasena">
              Una contraseña
            </label>
            <div className="relative">
              <input
                id="r-contrasena"
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
              {aviso ?? 'Al menos 8 caracteres. Una frase que te acuerdes sirve perfecto.'}
            </p>

            {error && <p className="ingreso-error">{error}</p>}

            <button className="ingreso-boton" disabled={cargando || !listo}>
              {cargando ? 'Enviando…' : 'Continuar'}
            </button>

            <Link className="ingreso-volver block" to="/app/entrar">
              Ya tengo cuenta
            </Link>
          </form>
        ) : (
          <form onSubmit={confirmar} noValidate>
            <p className="ingreso-texto">
              Te mandamos un código de 6 números por WhatsApp a <strong>{telefonoLindo}</strong>.
              Es para confirmar que ese teléfono es tuyo; después entrás con tu mail.
            </p>

            <label className="ingreso-etiqueta" htmlFor="r-codigo">
              Código
            </label>
            <input
              id="r-codigo"
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

            {error && <p className="ingreso-error">{error}</p>}

            <button className="ingreso-boton" disabled={cargando || codigo.length < 4}>
              {cargando ? 'Creando…' : 'Crear mi cuenta'}
            </button>

            <button
              type="button"
              className="ingreso-volver"
              onClick={() => {
                setPaso('datos');
                setError(null);
              }}
            >
              Corregir mis datos
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
