/**
 * Los últimos cobros del local (D-055).
 *
 * Está para una cosa concreta: arreglar un cobro mal hecho que ya no está en
 * pantalla. El comprobante cubre el error que se nota al instante; esto cubre
 * el que se nota cuando el cliente ya se fue, que es el que antes no tenía
 * salida ninguna.
 *
 * Sólo los del local de quien mira: el servidor filtra por la sesión, no por
 * un parámetro. Un vendedor no ve ni anula la caja de otro local.
 */
import { useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';
import { AnularCobro } from '../componentes/AnularCobro';

type Pago = {
  id: string;
  fecha: string;
  importeTexto: string;
  medioDePago: string;
  lineaDeNegocio: string;
  estado: string;
  motivoAnulado: string | null;
  cliente: string;
  telefono: string;
};

const MEDIOS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA_DEBITO: 'Débito',
  TARJETA_CREDITO: 'Crédito',
  QR: 'QR',
  BILLETERA_VIRTUAL: 'Billetera',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

const esDeHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function Recientes() {
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [recienAnulado, setRecienAnulado] = useState<string | null>(null);

  async function cargar() {
    try {
      const datos = await api<{ pagos: Pago[] }>('/cobros/recientes');
      setPagos(datos.pagos);
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudieron traer los últimos cobros');
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  if (error) return <p className="aviso-error">{error}</p>;
  if (!pagos) return <p className="text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Últimos cobros</h1>
        <p className="mt-1 text-sm text-slate-600">
          Los últimos 20 de este local. Si alguno salió mal, se anula desde acá.
        </p>
      </div>

      {pagos.length === 0 && (
        <div className="tarjeta text-center text-slate-500">
          Todavía no hay cobros registrados en este local.
        </div>
      )}

      <div className="space-y-2">
        {pagos.map((p) => {
          const anulado = p.estado === 'ANULADO';
          return (
            <div key={p.id} className={`tarjeta ${anulado ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="tabular text-lg font-semibold">{p.importeTexto}</span>
                <span className="font-medium">{p.cliente}</span>
                <span className="text-xs text-slate-500">
                  {esDeHoy(p.fecha) ? hora(p.fecha) : `${dia(p.fecha)} ${hora(p.fecha)}`}
                  {' · '}
                  {MEDIOS[p.medioDePago] ?? p.medioDePago}
                </span>
                {anulado && (
                  <span className="chip-estado bg-red-50 text-[var(--color-error)]">Anulado</span>
                )}
                {recienAnulado === p.id && (
                  <span className="chip-estado bg-amber-50 text-amber-700">
                    los puntos volvieron atrás
                  </span>
                )}

                {!anulado && anulando !== p.id && (
                  <button
                    type="button"
                    className="ml-auto text-xs font-medium text-slate-400 underline underline-offset-4 hover:text-[var(--color-error)]"
                    onClick={() => setAnulando(p.id)}
                  >
                    Anular
                  </button>
                )}
              </div>

              {anulado && p.motivoAnulado && (
                <p className="mt-2 text-xs text-slate-500">Motivo: {p.motivoAnulado}</p>
              )}

              {anulando === p.id && (
                <div className="mt-3 border-t border-[var(--color-borde)] pt-3">
                  <AnularCobro
                    pagoId={p.id}
                    importeTexto={p.importeTexto}
                    nombre={p.cliente}
                    alAnular={() => {
                      setAnulando(null);
                      setRecienAnulado(p.id);
                      void cargar();
                    }}
                    alCancelar={() => setAnulando(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
