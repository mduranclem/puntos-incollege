/**
 * Entrar con el teléfono y un código por WhatsApp (D-022).
 *
 * Dejó de ser la puerta principal cuando apareció la cuenta con mail (D-036),
 * pero sigue siendo importante: es por donde entra quien nunca se registró
 * —la cuenta se la abrió el mostrador al cobrarle— y quien se olvidó hasta del
 * mail con el que se anotó. El teléfono siempre alcanza.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiCliente, ErrorCliente, guardarAcceso } from './api';
import { Logo } from '../componentes/Logo';

type Paso = 'telefono' | 'codigo';

export function IngresoPorCodigo() {
  const [paso, setPaso] = useState<Paso>('telefono');
  const [telefono, setTelefono] = useState('');
  const [telefonoLindo, setTelefonoLindo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    campo.current?.focus();
  }, [paso]);

  async function pedir(evento: React.FormEvent) {
    evento.preventDefault();
    if (!telefono.trim() || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const datos = await apiCliente<{ telefonoLindo: string }>('/acceso/pedir', {
        cuerpo: { telefono },
      });
      setTelefonoLindo(datos.telefonoLindo);
      setCodigo('');
      setPaso('codigo');
    } catch (e) {
      setError(e instanceof ErrorCliente ? e.message : 'No pudimos enviarte el código.');
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
      const datos = await apiCliente<{ token: string }>('/acceso/confirmar', {
        cuerpo: { telefono, codigo },
      });
      guardarAcceso(datos.token);
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
        <Logo alto={56} alt="InCollege" className="ingreso-logo" />

        {paso === 'telefono' ? (
          <form onSubmit={pedir} noValidate>
            <p className="ingreso-texto">
              Poné tu teléfono y te mandamos un código por WhatsApp para entrar.
            </p>

            <label className="ingreso-etiqueta" htmlFor="telefono-cliente">
              Tu teléfono
            </label>
            <input
              id="telefono-cliente"
              ref={campo}
              className="ingreso-campo"
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

            {error && <p className="ingreso-error">{error}</p>}

            <button className="ingreso-boton" disabled={cargando || !telefono.trim()}>
              {cargando ? 'Enviando…' : 'Enviarme el código'}
            </button>

            <Link className="ingreso-volver block" to="/app/entrar">
              Entrar con mail y contraseña
            </Link>
          </form>
        ) : (
          <form onSubmit={confirmar} noValidate>
            <p className="ingreso-texto">
              Te mandamos un código de 6 números por WhatsApp a <strong>{telefonoLindo}</strong>.
            </p>

            <label className="ingreso-etiqueta" htmlFor="codigo-cliente">
              Código
            </label>
            <input
              id="codigo-cliente"
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
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>

            <button
              type="button"
              className="ingreso-volver"
              onClick={() => {
                setPaso('telefono');
                setError(null);
              }}
            >
              Usar otro teléfono
            </button>
          </form>
        )}
      </div>

      <p className="ingreso-pie">
        ¿Todavía no tenés cuenta? Se abre sola la primera vez que comprás pagando en
        efectivo en cualquiera de nuestros locales.
      </p>
    </div>
  );
}
