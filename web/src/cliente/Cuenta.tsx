/**
 * Pantalla principal: los puntos, y nada que distraiga de eso.
 *
 * Abajo del saldo, lo único que el cliente necesita en el momento de comprar:
 * su número para mostrar en el mostrador. El resto queda en las otras pestañas.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useNavigate } from 'react-router-dom';
import {
  apiCliente,
  cerrarAcceso,
  fechaLarga,
  fechaCorta,
  TEXTO_MOVIMIENTO,
  type Cuenta as DatosCuenta,
} from './api';

export function Cuenta() {
  const [cuenta, setCuenta] = useState<DatosCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNumero, setMostrarNumero] = useState(false);
  const lienzoQr = useRef<HTMLCanvasElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    apiCliente<DatosCuenta>('/cuenta', { conSesion: true })
      .then(setCuenta)
      .catch((e) => {
        if (e?.codigo === 'LINK_INVALIDO') {
          cerrarAcceso();
          navegar('/app/entrar', { replace: true });
          return;
        }
        setError('No pudimos cargar tu cuenta. Probá de nuevo en un momento.');
      });
  }, [navegar]);

  /**
   * El QR lleva sólo el teléfono, que es lo que el vendedor iba a tipear igual
   * (D-024). No lleva ninguna credencial: una foto de esta pantalla no sirve
   * para entrar a la cuenta.
   */
  useEffect(() => {
    if (!mostrarNumero || !cuenta || !lienzoQr.current) return;
    void QRCode.toCanvas(lienzoQr.current, cuenta.telefonoE164, {
      width: 200,
      margin: 1,
      color: { dark: '#0f2d52', light: '#ffffff' },
    });
  }, [mostrarNumero, cuenta]);

  if (error) {
    return (
      <div className="cta-centro">
        <p>{error}</p>
      </div>
    );
  }

  if (!cuenta) {
    return (
      <div className="cta-centro">
        <p className="cta-cargando">Cargando tu cuenta…</p>
      </div>
    );
  }

  const primerNombre = cuenta.nombre.split(' ')[0];
  const recientes = cuenta.movimientos.slice(0, 3);

  return (
    <div className="cta">
      <header className="cta-encabezado">
        <p className="cta-hola">
          {cuenta.nombre === 'Sin nombre' ? 'Hola' : `Hola ${primerNombre}`}
        </p>
        <button
          type="button"
          className="cta-salir"
          onClick={() => {
            cerrarAcceso();
            navegar('/app/entrar', { replace: true });
          }}
        >
          Salir
        </button>
      </header>

      <section className="cta-tarjeta" aria-label="Tus puntos">
        <p className="cta-numero">{cuenta.saldoPuntos}</p>
        <p className="cta-unidad">{cuenta.saldoPuntos === 1 ? 'punto' : 'puntos'}</p>
        <p className="cta-equivale">
          equivalen a <strong>{cuenta.equivalenteTexto}</strong> de descuento
        </p>

        {cuenta.faltaParaElProximoTexto !== '$0' && (
          <p className="cta-falta">
            Te faltan <strong>{cuenta.faltaParaElProximoTexto}</strong> en efectivo para sumar
            tu próximo punto.
          </p>
        )}

        <p className="cta-vence">Vencen el {fechaLarga(cuenta.temporada.venceEn)}</p>
      </section>

      <button
        type="button"
        className="cta-numero-boton"
        onClick={() => setMostrarNumero((v) => !v)}
        aria-expanded={mostrarNumero}
      >
        <span>Mi número para el mostrador</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={mostrarNumero ? 'girado' : ''}>
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {mostrarNumero && (
        <section className="cta-numero-caja">
          <canvas ref={lienzoQr} className="cta-qr" aria-hidden="true" />
          <p className="cta-numero-ayuda">O decí los últimos 4 números:</p>
          <p className="cta-numero-grande">{cuenta.telefono}</p>
          <p className="cta-numero-pie">Con eso encuentran tu cuenta. No hace falta nada más.</p>
        </section>
      )}

      {recientes.length > 0 && (
        <section className="cta-ultimos">
          <div className="cta-ultimos-titulo">
            <h2>Últimos movimientos</h2>
            <Link to="/app/movimientos">Ver todos</Link>
          </div>
          <ul className="cta-lista">
            {recientes.map((m, i) => (
              <li key={i}>
                <span className="cta-lista-que">
                  {TEXTO_MOVIMIENTO[m.tipo]}
                  <small>
                    {fechaCorta(m.fecha)}
                    {m.montoTexto ? ` · ${m.montoTexto}` : ''}
                    {m.local ? ` · ${m.local}` : ''}
                  </small>
                </span>
                <span className={`cta-lista-pts ${m.puntos > 0 ? 'suma' : 'resta'}`}>
                  {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cta-como">
        <h2>Cómo sumás</h2>
        <ul>
          <li>Pagando en efectivo en cualquiera de nuestros locales.</li>
          <li>
            Cada punto vale {cuenta.valorPuntoTexto} de descuento, hasta el{' '}
            {cuenta.topeCanjeBps / 100}% de la compra.
          </li>
          <li>El descuento no se junta con otras promociones.</li>
        </ul>
      </section>
    </div>
  );
}
