/**
 * Mi cuenta (D-039).
 *
 * En tres segundos hay que entender tres cosas: cuántos puntos tenés, cuánto
 * descuento son, y cómo te identificás en caja. Todo lo demás va abajo o
 * plegado.
 *
 * La tarjeta de saldo tiene tres caras según el estado **real** de la cuenta, y
 * ninguna se inventa: cuenta nueva sin movimientos, cuenta con saldo, y cuenta
 * que ya gastó todo lo que tenía. La carga y el error tienen las suyas: un cero
 * nunca significa "todavía no cargó".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link, useNavigate } from 'react-router-dom';
import { Desplegable } from './Desplegable';
import { apiCliente, cerrarAcceso, fechaLarga, type Cuenta as DatosCuenta } from './api';

/** Los últimos cuatro del teléfono, que es con lo que lo buscan en el mostrador. */
const ultimosCuatro = (telefonoE164: string) => telefonoE164.replace(/\D/g, '').slice(-4);

export function Cuenta() {
  const [cuenta, setCuenta] = useState<DatosCuenta | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [qrAbierto, setQrAbierto] = useState(false);
  const lienzoQr = useRef<HTMLCanvasElement>(null);
  const navegar = useNavigate();

  const cargar = useCallback(() => {
    setCargando(true);
    setError(false);
    apiCliente<DatosCuenta>('/cuenta', { conSesion: true })
      .then((datos) => {
        setCuenta(datos);
        setCargando(false);
      })
      .catch((e) => {
        if (e?.codigo === 'LINK_INVALIDO') {
          cerrarAcceso();
          navegar('/app/entrar', { replace: true });
          return;
        }
        setError(true);
        setCargando(false);
      });
  }, [navegar]);

  useEffect(cargar, [cargar]);

  /**
   * El QR lleva sólo el teléfono, que es lo que el vendedor iba a tipear igual
   * (D-024). No lleva ninguna credencial: una foto de esta pantalla no sirve
   * para entrar a la cuenta. Sin logos encima ni efectos: tiene que escanearse.
   */
  useEffect(() => {
    if (!qrAbierto || !cuenta || !lienzoQr.current) return;
    void QRCode.toCanvas(lienzoQr.current, cuenta.telefonoE164, {
      width: 380,
      margin: 2,
      color: { dark: '#102d4f', light: '#ffffff' },
    });
  }, [qrAbierto, cuenta]);

  if (cargando) return <CuentaCargando />;

  if (error || !cuenta) {
    return (
      <div className="cta">
        <div className="cta-error">
          <p>No pudimos cargar tus puntos</p>
          <button type="button" className="cta-reintentar" onClick={cargar}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const primerNombre = cuenta.nombre.split(' ')[0];
  const saludo =
    cuenta.nombre === 'Sin nombre' || cuenta.nombre === 'Cliente'
      ? 'Hola'
      : `Hola, ${primerNombre}`;

  const conSaldo = cuenta.saldoPuntos > 0;
  // Sin saldo pero con historial: ya usó lo que tenía. Es un mensaje distinto
  // al de bienvenida, y se puede distinguir porque los movimientos están.
  const yaUso = !conSaldo && cuenta.movimientos.length > 0;

  return (
    <div className="cta">
      <header>
        <h1 className="cta-saludo">{saludo}</h1>
        <p className="cta-bajada">Tu próxima compra suma</p>
      </header>

      <TarjetaDeSaldo cuenta={cuenta} conSaldo={conSaldo} yaUso={yaUso} />

      <Desplegable
        titulo="Mostrar QR para caja"
        detalle={
          <>
            Últimos 4 de tu celular · <b>{ultimosCuatro(cuenta.telefonoE164)}</b>
          </>
        }
        abierto={qrAbierto}
        alCambiar={setQrAbierto}
      >
        <canvas ref={lienzoQr} className="qr-lienzo" aria-label="Código QR de tu cuenta" />
        <p className="qr-instruccion">Mostrá este QR en caja</p>
        <p className="qr-alternativa">O decile al vendedor los últimos 4 números de tu celular</p>
        <p className="qr-digitos">{ultimosCuatro(cuenta.telefonoE164)}</p>
        <p className="qr-telefono">Tu teléfono completo: {cuenta.telefono}</p>
      </Desplegable>

      <section className="simple" aria-labelledby="asi-de-simple">
        <h2 id="asi-de-simple">Así de simple</h2>
        <div className="simple-grilla">
          <div className="simple-caja">
            <p className="simple-rotulo">Sumás</p>
            <p className="simple-dato">1 punto</p>
            <p className="simple-detalle">
              Cada {cuenta.porPuntoTexto} pagados en efectivo en el local
            </p>
          </div>
          <div className="simple-caja">
            <p className="simple-rotulo">Usás</p>
            <p className="simple-dato">{cuenta.valorPuntoTexto}</p>
            <p className="simple-detalle">
              De descuento por punto. Hasta el {cuenta.topeCanjeBps / 100}% de tu compra
            </p>
          </div>
        </div>
      </section>

      <Desplegable titulo="Condiciones y vencimiento">
        <div className="condiciones-lista">
          <p>
            Sumás 1 punto por cada {cuenta.porPuntoTexto} que pagás en efectivo en el local.
          </p>
          <p>
            Lo que no llega a completar un punto queda guardado y se suma a tu próxima compra
            en efectivo.
          </p>
          <p>
            Cada punto vale {cuenta.valorPuntoTexto} de descuento, hasta el{' '}
            {cuenta.topeCanjeBps / 100}% de tu compra.
          </p>
          <p>El descuento con puntos no se combina con otras promociones.</p>
          <p>Tus puntos vencen el {fechaLarga(cuenta.temporada.venceEn)}.</p>
        </div>
      </Desplegable>

      <Link className="cta-enlace-local" to="/app/locales">
        Encontrá tu local
      </Link>
    </div>
  );
}

/** La tarjeta cambia de cara según el estado real de la cuenta. */
function TarjetaDeSaldo({
  cuenta,
  conSaldo,
  yaUso,
}: {
  cuenta: DatosCuenta;
  conSaldo: boolean;
  yaUso: boolean;
}) {
  // El avance hacia el próximo punto sale del remanente real que guarda el
  // libro mayor (D-005). Si no hay tasa configurada no se dibuja nada: antes
  // que inventar un porcentaje, no mostrarlo.
  const porPunto = Number(cuenta.porPuntoCentavos);
  const remanente = Number(cuenta.remanenteCentavos);
  const hayAvance = porPunto > 0 && cuenta.movimientos.length > 0;
  const avance = hayAvance ? Math.min(100, Math.max(0, (remanente / porPunto) * 100)) : 0;
  const falta = cuenta.faltaParaElProximoTexto;

  return (
    <section className="saldo" aria-labelledby="tus-puntos">
      <p className="saldo-etiqueta" id="tus-puntos">
        Tus puntos
      </p>

      {conSaldo ? (
        <>
          <p className="saldo-plata">
            {cuenta.equivalenteTexto} <small>de descuento</small>
          </p>
          <p className="saldo-puntos">
            Tenés {cuenta.saldoPuntos} {cuenta.saldoPuntos === 1 ? 'punto' : 'puntos'}
          </p>
          <p className="saldo-vence">Vencen el {fechaLarga(cuenta.temporada.venceEn)}</p>
        </>
      ) : (
        <>
          <p className="saldo-cero">
            {cuenta.saldoPuntos} <small>puntos · {cuenta.equivalenteTexto} de descuento</small>
          </p>
          {yaUso ? (
            <p className="saldo-titular">
              Ya aprovechaste tus puntos. Tu próxima compra vuelve a sumar
            </p>
          ) : (
            <>
              <p className="saldo-titular">Todo empieza con tu primer punto</p>
              <p className="saldo-explica">
                Por cada {cuenta.porPuntoTexto} en efectivo que pagás en el local, sumás 1
                punto.
              </p>
              <p className="saldo-remate">
                1 punto = {cuenta.valorPuntoTexto} de descuento
              </p>
            </>
          )}
        </>
      )}

      {hayAvance && falta !== '$0' && (
        <div className="avance">
          <div
            className="avance-riel"
            role="progressbar"
            aria-valuenow={Math.round(avance)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance hacia tu próximo punto"
          >
            <div className="avance-parte" style={{ width: `${avance}%` }} />
          </div>
          <p className="avance-texto">
            Te faltan <strong>{falta}</strong> en efectivo para sumar tu próximo punto.
          </p>
        </div>
      )}
    </section>
  );
}

/** Reserva el lugar de la tarjeta mientras carga, en vez de mostrar un cero. */
function CuentaCargando() {
  return (
    <div className="cta" aria-busy="true" aria-live="polite">
      <header>
        <div className="esqueleto h-7 w-40" />
        <div className="esqueleto mt-2 h-4 w-52" />
      </header>
      <section className="saldo">
        <div className="esqueleto h-3 w-24" />
        <div className="esqueleto mt-4 h-10 w-52" />
        <div className="esqueleto mt-4 h-4 w-32" />
        <div className="esqueleto mt-6 h-1.5 w-full" />
      </section>
      <div className="esqueleto h-[52px] w-full rounded-[20px]" />
      <div className="esqueleto h-[140px] w-full rounded-[20px]" />
      <span className="sr-only">Cargando tu cuenta</span>
    </div>
  );
}
