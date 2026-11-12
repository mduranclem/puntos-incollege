/**
 * Recibo imprimible del cobro (D-043).
 *
 * Se dibuja siempre, pero sólo se ve al imprimir: en pantalla queda oculto y
 * al imprimir se oculta todo lo demás (ver `@media print` en estilos.css). Así
 * no hace falta abrir una ventana nueva ni armar el papel a mano.
 *
 * **La fecha sale del pago, no del reloj del navegador.** Es la que quedó en el
 * libro mayor: si mañana alguien compara este papel contra el registro diario,
 * tienen que decir lo mismo.
 *
 * **No lleva el link firmado de la cuenta.** El aviso de WhatsApp sí lo manda,
 * porque va al teléfono del dueño de la cuenta; un papel se pierde, se tira y
 * lo levanta cualquiera. Acá va la dirección pelada de la app, que no da acceso
 * a nada por sí sola.
 */
import { formatearPesos, type ItemElegido } from '../api';

type Props = {
  /** Identificador del pago. Se muestra abreviado: es para ubicar el recibo. */
  pagoId: string;
  /** ISO del pago, tal como quedó registrado. */
  fecha: string;
  local: string;
  vendedor: string;
  cliente: string;
  telefono: string;
  items: ItemElegido[];
  /** Precio de lista, antes del recargo por forma de pago (D-061). */
  baseTexto: string;
  /** `null` cuando la forma de pago no tiene recargo. */
  recargoTexto: string | null;
  recargoPorcentajeTexto: string;
  /** Lo que se cobró, recargo incluido. */
  totalTexto: string;
  medio: string;
  acredito: boolean;
  puntosAcreditados: number;
  saldoPuntos: number;
  equivalenteTexto: string;
};

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** "27/09/2026 · 14:35" con el reloj del pago. */
function cuando(iso: string): string {
  const f = new Date(iso);
  return (
    `${dosDigitos(f.getDate())}/${dosDigitos(f.getMonth() + 1)}/${f.getFullYear()}` +
    ` · ${dosDigitos(f.getHours())}:${dosDigitos(f.getMinutes())}`
  );
}

export function Recibo({
  pagoId,
  fecha,
  local,
  vendedor,
  cliente,
  telefono,
  items,
  baseTexto,
  recargoTexto,
  recargoPorcentajeTexto,
  totalTexto,
  medio,
  acredito,
  puntosAcreditados,
  saldoPuntos,
  equivalenteTexto,
}: Props) {

  return (
    <div className="recibo" aria-hidden="true">
      <img src="/logo-incollege.png" alt="" className="recibo-logo" />
      <p className="recibo-subtitulo">Programa de puntos</p>

      <p className="recibo-meta">
        Recibo {pagoId.slice(0, 8).toUpperCase()}
        <br />
        {cuando(fecha)}
        <br />
        {local} · {vendedor}
      </p>

      <hr className="recibo-linea" />

      <p className="recibo-meta">
        <strong>{cliente}</strong>
        <br />
        {telefono}
      </p>

      <hr className="recibo-linea" />

      {items.length > 0 ? (
        <table className="recibo-tabla">
          <tbody>
            {items.map((i) => (
              <tr key={i.clave}>
                <td className="recibo-cant">{i.cantidad}</td>
                <td className="recibo-que">
                  {i.descripcion}
                  {/* El talle va en el recibo: es lo primero que se mira para un cambio. */}
                  {i.talle ? ` (${i.talle})` : ''}
                  {i.cantidad > 1 && (
                    <small> · {formatearPesos(i.precioUnitarioCentavos)} c/u</small>
                  )}
                </td>
                <td className="recibo-sub">
                  {formatearPesos(i.precioUnitarioCentavos * i.cantidad)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="recibo-meta">Sin detalle de artículos.</p>
      )}

      <hr className="recibo-linea" />

      {/* Con recargo, el papel tiene que explicar por qué el total no es la
          suma de los artículos. Sin esto, el primer cambio en el local es una
          discusión. */}
      {recargoTexto && (
        <>
          <p className="recibo-total recibo-total-chico">
            <span>Subtotal de lista</span>
            <span>{baseTexto}</span>
          </p>
          <p className="recibo-total recibo-total-chico">
            <span>Recargo {recargoPorcentajeTexto}</span>
            <span>+{recargoTexto}</span>
          </p>
        </>
      )}

      <p className="recibo-total">
        <span>Total</span>
        <span>{totalTexto}</span>
      </p>
      <p className="recibo-meta">Forma de pago: {medio}</p>

      <hr className="recibo-linea" />

      {acredito ? (
        <>
          <p className="recibo-total">
            <span>Puntos sumados</span>
            <span>+{puntosAcreditados}</span>
          </p>
          <p className="recibo-meta">
            Saldo: {saldoPuntos} {saldoPuntos === 1 ? 'punto' : 'puntos'} · equivalen a{' '}
            {equivalenteTexto} de descuento
          </p>
        </>
      ) : (
        <p className="recibo-meta">
          Esta compra no suma puntos: los puntos son sólo por pago en efectivo.
        </p>
      )}

      <hr className="recibo-linea" />

      <p className="recibo-pie">
        Mirá tus puntos en
        <br />
        <strong>{typeof location !== 'undefined' ? location.host : ''}</strong>
        <br />
        Creá tu cuenta con este mismo teléfono.
      </p>
    </div>
  );
}
