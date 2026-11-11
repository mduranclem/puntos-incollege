/**
 * Anular un cobro (D-054).
 *
 * Lo usan las dos pantallas donde un error se descubre: el comprobante, cuando
 * se nota al instante, y la lista de últimos cobros, cuando se nota veinte
 * minutos después. El formulario es el mismo para que la decisión se tome
 * igual en los dos lados.
 *
 * No borra nada: el motor genera un movimiento `REVERSA` y el pago queda
 * `ANULADO` con su motivo (D-004).
 */
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi } from '../api';

export function AnularCobro({
  pagoId,
  importeTexto,
  nombre,
  alAnular,
  alCancelar,
}: {
  pagoId: string;
  importeTexto: string;
  nombre: string;
  alAnular: () => void;
  alCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => campo.current?.focus(), []);

  async function confirmar() {
    if (motivo.trim().length < 3 || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await api(`/cobros/${pagoId}/anular`, { cuerpo: { motivo: motivo.trim() } });
      alAnular();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo anular el cobro');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Anular el cobro de {importeTexto}</p>
      <p className="text-xs text-slate-500">
        Se le descuentan a {nombre} los puntos de ese cobro. Queda registrado como anulado,
        con el motivo: no se borra nada.
      </p>
      <input
        ref={campo}
        className="campo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void confirmar();
          if (e.key === 'Escape') alCancelar();
        }}
        placeholder="Motivo: importe mal tipeado, cliente equivocado…"
        maxLength={200}
      />
      {error && <p className="aviso-error">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="boton-peligro py-3"
          disabled={motivo.trim().length < 3 || guardando}
          onClick={() => void confirmar()}
        >
          {guardando ? 'Anulando…' : 'Confirmar anulación'}
        </button>
        <button type="button" className="boton-secundario py-3" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
