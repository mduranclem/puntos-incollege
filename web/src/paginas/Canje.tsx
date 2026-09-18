/**
 * Canje en el mostrador. El vendedor busca por teléfono, ve el saldo, carga el
 * total de la venta y aplica el descuento. El tope y la regla de no acumular con
 * otros beneficios las impone el backend; acá se muestran para que se entiendan.
 */
import { useEffect, useRef, useState } from 'react';
import {
  api,
  ErrorApi,
  formatearPesos,
  itemsParaLaApi,
  totalDeItems,
  type ItemElegido,
  type ResumenDeCuenta,
} from '../api';
import { SelectorDeArticulos } from '../componentes/SelectorDeArticulos';

type Simulacion = ResumenDeCuenta & {
  encontrado: boolean;
  puntosMaximos: number;
  descuentoMaximoTexto: string;
  topeTexto: string;
};

type Resultado = ResumenDeCuenta & {
  puntosCanjeados: number;
  descuentoTexto: string;
  totalVentaTexto: string;
  aCobrarTexto: string;
};

type Beneficio = 'NINGUNO' | 'DESCUENTO_CONTADO_10' | 'BONIFICACION_PRIMERA_CUOTA_50';

const BENEFICIOS: Array<{ valor: Beneficio; texto: string }> = [
  { valor: 'NINGUNO', texto: 'Ninguno' },
  { valor: 'DESCUENTO_CONTADO_10', texto: '10% pago contado' },
  { valor: 'BONIFICACION_PRIMERA_CUOTA_50', texto: '50% primera cuota' },
];

export function Canje() {
  const [telefono, setTelefono] = useState('');
  const [totalVenta, setTotalVenta] = useState('');
  const [puntos, setPuntos] = useState('');
  const [beneficio, setBeneficio] = useState<Beneficio | null>(null);
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [items, setItems] = useState<ItemElegido[]>([]);

  const campoTelefono = useRef<HTMLInputElement>(null);
  const campoTotal = useRef<HTMLInputElement>(null);

  useEffect(() => campoTelefono.current?.focus(), []);

  /** Con artículos elegidos, el total de la venta lo manda el detalle (D-027). */
  const totalCentavos = items.length > 0 ? totalDeItems(items) : 0;
  const totalParaSimular = items.length > 0 ? String(totalCentavos / 100) : totalVenta;

  async function simular() {
    if (!telefono.trim() || !totalParaSimular.trim()) return;
    setError(null);
    try {
      const datos = await api<Simulacion>(
        `/canjes/simular?telefono=${encodeURIComponent(telefono)}&totalVenta=${encodeURIComponent(totalParaSimular)}`,
      );
      if (!datos.encontrado) {
        setSimulacion(null);
        setError('Ese teléfono no tiene cuenta de puntos.');
        return;
      }
      setSimulacion(datos);
      setPuntos(String(datos.puntosMaximos));
    } catch (e) {
      setSimulacion(null);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo calcular el canje');
    }
  }

  async function confirmar() {
    if (!simulacion || !beneficio || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const datos = await api<Resultado>('/canjes', {
        cuerpo: {
          telefono,
          ...(items.length > 0 ? { items: itemsParaLaApi(items) } : { totalVenta }),
          puntos: Number(puntos),
          beneficiosAplicados: beneficio === 'NINGUNO' ? [] : [beneficio],
        },
      });
      setResultado(datos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar el canje');
      if (e instanceof ErrorApi) void simular(); // el saldo pudo cambiar en otra caja
    } finally {
      setCargando(false);
    }
  }

  function limpiar() {
    setTelefono('');
    setTotalVenta('');
    setItems([]);
    setPuntos('');
    setBeneficio(null);
    setSimulacion(null);
    setResultado(null);
    setError(null);
    setTimeout(() => campoTelefono.current?.focus(), 0);
  }

  if (resultado) {
    return (
      <div className="space-y-4">
        <div className="tarjeta text-center">
          <p className="text-sm text-slate-600">
            Canje registrado · {resultado.cliente.nombre}
          </p>
          <p className="mt-4 text-sm uppercase tracking-wide text-slate-500">A cobrar</p>
          <p className="tabular text-5xl font-bold text-[var(--color-marino)]">
            {resultado.aCobrarTexto}
          </p>
          <p className="mt-2 text-slate-600">
            {resultado.totalVentaTexto} − {resultado.descuentoTexto} ({resultado.puntosCanjeados}{' '}
            punto{resultado.puntosCanjeados === 1 ? '' : 's'})
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Le quedan <strong>{resultado.saldoPuntos}</strong> punto
            {resultado.saldoPuntos === 1 ? '' : 's'} ({resultado.equivalenteTexto}).
          </p>
        </div>
        <button className="boton-principal w-full py-4 text-lg" onClick={limpiar} autoFocus>
          Nuevo canje
        </button>
      </div>
    );
  }

  const maximo = simulacion?.puntosMaximos ?? 0;
  const puntosNumero = Number(puntos || 0);
  const excede = puntosNumero > maximo;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Canjear puntos</h1>

      <form
        className="tarjeta space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void (simulacion ? confirmar() : simular());
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta" htmlFor="telefono">
              Teléfono
            </label>
            <input
              id="telefono"
              ref={campoTelefono}
              className="campo-grande"
              type="tel"
              inputMode="tel"
              placeholder="341 555 1234"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                setSimulacion(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  campoTotal.current?.focus();
                }
              }}
            />
          </div>

          <div>
            <label className="etiqueta" htmlFor="total">
              Total de la venta (precio de lista)
            </label>
            <input
              id="total"
              ref={campoTotal}
              className="campo-grande"
              inputMode="decimal"
              placeholder="0"
              readOnly={items.length > 0}
              value={items.length > 0 ? formatearPesos(totalCentavos).replace('$', '') : totalVenta}
              onChange={(e) => {
                setTotalVenta(e.target.value.replace(/[^\d.,]/g, ''));
                setSimulacion(null);
              }}
              onBlur={() => void simular()}
            />
          </div>
        </div>

        <SelectorDeArticulos
          items={items}
          alCambiar={(nuevos) => {
            setItems(nuevos);
            setSimulacion(null);
          }}
          titulo="Qué está comprando"
        />

        {!simulacion && (
          <button className="boton-secundario w-full" type="submit">
            Ver saldo y descuento posible
          </button>
        )}

        {simulacion && (
          <>
            <div className="rounded-xl bg-[var(--color-punto-suave)] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{simulacion.cliente.nombre}</p>
                  <p className="text-sm text-slate-600">{simulacion.cliente.telefono}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="tabular text-2xl font-bold leading-none">
                    {simulacion.saldoPuntos}
                  </p>
                  <p className="text-xs text-slate-600">disponibles</p>
                </div>
              </div>
              <p className="mt-3 border-t border-black/5 pt-3 text-sm text-slate-700">
                Tope de esta venta: {simulacion.topeTexto} ({simulacion.topeCanjeBps / 100}%). Puede
                usar hasta <strong>{maximo}</strong> punto{maximo === 1 ? '' : 's'} ={' '}
                {simulacion.descuentoMaximoTexto}.
              </p>
            </div>

            <div>
              <label className="etiqueta" htmlFor="puntos">
                Puntos a canjear
              </label>
              <input
                id="puntos"
                className="campo-grande"
                inputMode="numeric"
                value={puntos}
                onChange={(e) => setPuntos(e.target.value.replace(/\D/g, ''))}
              />
              {excede && (
                <p className="mt-1.5 text-sm text-[var(--color-error)]">
                  El máximo para esta venta es {maximo}.
                </p>
              )}
            </div>

            <fieldset>
              <legend className="etiqueta">
                ¿Se aplicó otro beneficio en esta venta? (obligatorio)
              </legend>
              <div className="flex flex-wrap gap-2">
                {BENEFICIOS.map((b) => (
                  <button
                    key={b.valor}
                    type="button"
                    onClick={() => setBeneficio(b.valor)}
                    className={`chip border ${
                      beneficio === b.valor
                        ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                        : 'border-[var(--color-borde)] bg-white text-slate-700'
                    }`}
                  >
                    {b.texto}
                  </button>
                ))}
              </div>
              {beneficio && beneficio !== 'NINGUNO' && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
                  El canje no se acumula con otros beneficios: es uno o el otro.
                </p>
              )}
            </fieldset>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
                {error}
              </p>
            )}

            <button
              className="boton-principal w-full py-4 text-lg"
              disabled={
                cargando ||
                !beneficio ||
                beneficio !== 'NINGUNO' ||
                puntosNumero <= 0 ||
                excede
              }
            >
              {cargando ? 'Aplicando…' : 'Aplicar canje'}
            </button>
          </>
        )}

        {error && !simulacion && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>
        )}
      </form>
    </div>
  );
}
