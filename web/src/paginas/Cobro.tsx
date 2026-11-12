/**
 * Pantalla de cobro en el mostrador.
 *
 * Se usa con gente esperando: se completa entera con el teclado, sin mouse y sin
 * recargas. Teléfono → Enter → importe → Enter → listo. La forma de pago arranca
 * en efectivo, que es el caso que interesa al programa.
 *
 * Los importes que se tipean y los precios del catálogo son **de contado**. La
 * forma de pago le suma su recargo (D-061) y la pantalla muestra el desglose
 * antes de confirmar: el vendedor tiene que poder decir en voz alta "la prenda
 * sale esto, el recargo de la tarjeta es esto, total esto".
 */
import { useEffect, useRef, useState } from 'react';
import {
  api,
  ErrorApi,
  formatearPesos,
  itemsParaLaApi,
  leerSesion,
  totalDeItems,
  calcularRecargo,
  leerImporte,
  type FormaDePago,
  type ItemElegido,
  type ResumenDeCuenta,
} from '../api';
import { Escaner, useHayCamara } from '../componentes/Escaner';
import { SelectorDeArticulos } from '../componentes/SelectorDeArticulos';
import { Recibo } from '../componentes/Recibo';
import { AnularCobro } from '../componentes/AnularCobro';

type Linea = 'UNIFORMES' | 'ROPA_LISA';

type Coincidencia = {
  id: string;
  nombre: string;
  telefono: string;
  telefonoE164: string;
  saldoPuntos: number;
};

type Resultado = ResumenDeCuenta & {
  pagoId: string;
  fecha: string;
  acredito: boolean;
  yaAplicado: boolean;
  puntosAcreditados: number;
  importeTexto: string;
  baseTexto: string;
  recargoTexto: string;
  recargoBps: number;
  recargoPorcentajeTexto: string;
  formaDePago: { codigo: string; nombre: string } | null;
  link: string;
};

/** El efectivo es el que interesa al programa, y es el que no tiene recargo. */
const FORMA_POR_DEFECTO = 'efectivo';

const LINEAS: Array<{ valor: Linea; texto: string; tecla: string }> = [
  { valor: 'UNIFORMES', texto: 'Uniformes', tecla: 'u' },
  { valor: 'ROPA_LISA', texto: 'Ropa lisa', tecla: 'r' },
];

const nuevaReferencia = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function Cobro() {
  const sesion = leerSesion();
  const [telefono, setTelefono] = useState('');
  const [importe, setImporte] = useState('');
  /**
   * Las formas de pago salen de la API (D-061). Mientras no cargaron no se
   * cobra: sin saber el recargo, el total de la pantalla sería mentira.
   */
  const [formas, setFormas] = useState<FormaDePago[]>([]);
  const [forma, setForma] = useState(FORMA_POR_DEFECTO);
  const [fallaronFormas, setFallaronFormas] = useState(false);
  /** `null` = deducida de los artículos. Con valor, la eligió la vendedora. */
  const [lineaElegida, setLineaElegida] = useState<Linea | null>(null);
  const [referencia, setReferencia] = useState(nuevaReferencia);

  const [cliente, setCliente] = useState<ResumenDeCuenta | null>(null);
  /**
   * Por qué no se puede cobrar: el teléfono no está en el programa, o está pero
   * es una ficha vieja sin cuenta en la app (D-060). Las dos terminan igual —no
   * se cobra— pero no se dicen igual.
   */
  const [bloqueo, setBloqueo] = useState<'NO_EXISTE' | 'SIN_CUENTA' | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([]);
  const [marcada, setMarcada] = useState(0);
  const [escaneando, setEscaneando] = useState(false);
  const hayCamara = useHayCamara();
  const [items, setItems] = useState<ItemElegido[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const campoTelefono = useRef<HTMLInputElement>(null);
  const campoImporte = useRef<HTMLInputElement>(null);

  useEffect(() => campoTelefono.current?.focus(), []);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const datos = await api<{ formas: FormaDePago[] }>('/cobros/formas-de-pago');
        if (!vigente) return;
        setFormas(datos.formas);
        // Si la gerencia apagó el efectivo —no debería, pero puede— se arranca
        // con la primera que haya en vez de quedar con una elegida que no existe.
        if (!datos.formas.some((f) => f.codigo === FORMA_POR_DEFECTO) && datos.formas[0]) {
          setForma(datos.formas[0].codigo);
        }
      } catch {
        if (vigente) setFallaronFormas(true);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (cliente) campoImporte.current?.focus();
  }, [cliente]);

  /**
   * Mientras el vendedor tipea, busca coincidencias por últimos dígitos o por
   * nombre (D-023). No se activa con el teléfono completo: ese camino sigue
   * siendo instantáneo y sin lista.
   */
  useEffect(() => {
    const texto = telefono.trim();
    const digitos = texto.replace(/\D/g, '');
    const tieneLetras = /[a-záéíóúñü]/i.test(texto);
    const buscable = tieneLetras ? texto.length >= 2 : digitos.length >= 3 && digitos.length <= 9;

    if (cliente || bloqueo || !buscable) {
      setCoincidencias([]);
      return;
    }

    const reloj = setTimeout(async () => {
      try {
        const datos = await api<{ coincidencias: Coincidencia[] }>(
          `/clientes/sugerencias?q=${encodeURIComponent(texto)}`,
        );
        setCoincidencias(datos.coincidencias);
        setMarcada(0);
      } catch {
        setCoincidencias([]);
      }
    }, 200);
    return () => clearTimeout(reloj);
  }, [telefono, cliente, bloqueo]);

  // Atajos: Alt+número para la forma de pago, Alt+U / Alt+R para la línea.
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (!evento.altKey) return;
      // La tecla es la posición en la lista: la manda el orden que puso la
      // gerencia, no una constante de esta pantalla.
      const indice = Number(evento.key) - 1;
      const porForma = Number.isInteger(indice) && indice >= 0 ? formas[indice] : undefined;
      if (porForma) {
        evento.preventDefault();
        setForma(porForma.codigo);
        return;
      }
      // alt+u / alt+r siguen sirviendo para forzar la línea a mano, por si la
      // deducida no es la que corresponde.
      const porLinea = LINEAS.find((l) => l.tecla === evento.key.toLowerCase());
      if (porLinea) {
        evento.preventDefault();
        setLineaElegida(porLinea.valor);
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [formas]);

  /** Trae al cliente por teléfono completo. Es el camino de siempre, sin cambios. */
  async function buscar(texto = telefono) {
    if (!texto.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const datos = await api<{ encontrado: boolean } & Partial<ResumenDeCuenta>>(
        `/clientes/buscar?telefono=${encodeURIComponent(texto)}`,
      );
      if (datos.encontrado) {
        elegir(datos as ResumenDeCuenta);
      } else {
        setCliente(null);
        setCoincidencias([]);
        setBloqueo('NO_EXISTE');
      }
    } catch (e) {
      setCliente(null);
      setBloqueo(null);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar el teléfono');
    } finally {
      setBuscando(false);
    }
  }

  /** El QR trae el teléfono: se busca como si lo hubiera tipeado (D-024). */
  function alEscanear(texto: string) {
    setEscaneando(false);
    const leido = texto.trim();
    setTelefono(leido);
    void buscar(leido);
  }

  function elegir(datos: ResumenDeCuenta) {
    setCliente(datos);
    setCoincidencias([]);
    // Una ficha vieja sin cuenta se muestra igual —el vendedor tiene que ver de
    // quién habla— pero no se le puede cobrar (D-060).
    setBloqueo(datos.tieneCuenta ? null : 'SIN_CUENTA');
    setTelefono(datos.cliente.telefonoE164);
  }

  /** Abre la cuenta de una coincidencia elegida de la lista. */
  async function abrirCoincidencia(c: Coincidencia) {
    setBuscando(true);
    try {
      const datos = await api<ResumenDeCuenta>(`/clientes/${c.id}`);
      elegir(datos);
    } catch {
      setError('No se pudo abrir esa cuenta');
    } finally {
      setBuscando(false);
    }
  }

  /** Con artículos elegidos, el precio de lista lo manda el detalle (D-027). */
  const baseCentavos = items.length > 0 ? totalDeItems(items) : leerImporte(importe);
  const hayMonto = items.length > 0 || importe.trim() !== '';

  /**
   * El desglose: precio de lista, recargo de la forma de pago y total (D-061).
   * Se calcula acá sólo para mostrarlo; el que cobra es el servidor.
   */
  const formaElegida = formas.find((f) => f.codigo === forma) ?? null;
  const recargoCentavos = calcularRecargo(baseCentavos, formaElegida?.recargoBps ?? 0);
  const totalCentavos = baseCentavos + recargoCentavos;
  const hayRecargo = recargoCentavos > 0;
  const acredita = formaElegida?.acredita ?? false;

  /**
   * La línea sale de lo que se vendió, no de un botón más (D-043).
   *
   * Si la venta mezcla líneas —una remera lisa y una campera de uniforme, que
   * es de lo más común— se registra con la que se llevó la mayor parte de la
   * plata, y la pantalla lo dice. El modelo guarda una línea por pago y de ahí
   * sale la tasa de acumulación: elegir en silencio sería decidir sobre plata
   * sin que nadie lo vea.
   */
  const porLineaCentavos = items.reduce<Record<string, number>>((acc, i) => {
    if (!i.lineaDeNegocio) return acc;
    acc[i.lineaDeNegocio] = (acc[i.lineaDeNegocio] ?? 0) + i.precioUnitarioCentavos * i.cantidad;
    return acc;
  }, {});
  const lineasPresentes = Object.keys(porLineaCentavos) as Linea[];
  const lineaDeducida: Linea | null =
    lineasPresentes.length === 0
      ? null
      : lineasPresentes.reduce((a, b) => (porLineaCentavos[a]! >= porLineaCentavos[b]! ? a : b));
  const lineaMezclada = lineasPresentes.length > 1;
  const linea: Linea = lineaElegida ?? lineaDeducida ?? 'UNIFORMES';

  async function registrar() {
    if (!telefono.trim() || !hayMonto || guardando || bloqueo || !formaElegida) return;
    setGuardando(true);
    setError(null);
    try {
      const datos = await api<Resultado>('/cobros', {
        cuerpo: {
          telefono,
          ...(items.length > 0 ? { items: itemsParaLaApi(items) } : { importe }),
          formaDePago: forma,
          lineaDeNegocio: linea,
          referencia,
        },
      });
      setResultado(datos);
      setConfirmando(false);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo registrar el cobro');
    } finally {
      setGuardando(false);
    }
  }

  function nuevoCobro() {
    setTelefono('');
    setImporte('');
    setItems([]);
    setConfirmando(false);
    setForma(formas.some((f) => f.codigo === FORMA_POR_DEFECTO) ? FORMA_POR_DEFECTO : forma);
    setLineaElegida(null);
    setCliente(null);
    setBloqueo(null);
    setCoincidencias([]);
    setResultado(null);
    setError(null);
    setReferencia(nuevaReferencia());
    setTimeout(() => campoTelefono.current?.focus(), 0);
  }

  if (resultado) {
    return (
      <Comprobante
        resultado={resultado}
        items={items}
        medio={resultado.formaDePago?.nombre ?? formaElegida?.nombre ?? ''}
        local={sesion?.localNombre ?? ''}
        vendedor={sesion?.nombre ?? sesion?.usuario ?? ''}
        alSeguir={nuevoCobro}
      />
    );
  }

  if (confirmando) {
    return (
      <Confirmacion
        cliente={cliente?.cliente.nombre ?? null}
        telefono={cliente?.cliente.telefono ?? telefono}
        items={items}
        baseTexto={formatearPesos(baseCentavos)}
        recargoTexto={hayRecargo ? formatearPesos(recargoCentavos) : null}
        recargoPorcentajeTexto={formaElegida?.recargoTexto ?? ''}
        totalTexto={formatearPesos(totalCentavos)}
        medio={formaElegida?.nombre ?? ''}
        acredita={acredita}
        guardando={guardando}
        alConfirmar={() => void registrar()}
        alVolver={() => setConfirmando(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {escaneando && <Escaner alLeer={alEscanear} alCerrar={() => setEscaneando(false)} />}

      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">Cobrar</h1>
        <span className="text-sm text-slate-500">{sesion?.localNombre}</span>
      </div>

      <form
        className="tarjeta space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          // Nunca se cobra de un saque: primero se confirma (D-028).
          if (telefono.trim() && hayMonto && !bloqueo && formaElegida) setConfirmando(true);
        }}
      >
        <div>
          <label className="etiqueta" htmlFor="telefono">
            Teléfono del cliente
          </label>
          <input
            id="telefono"
            ref={campoTelefono}
            className="campo-grande"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="341 555 1234"
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              setCliente(null);
              setBloqueo(null);
            }}
            onKeyDown={(e) => {
              if (coincidencias.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMarcada((m) => (m + 1) % coincidencias.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMarcada((m) => (m - 1 + coincidencias.length) % coincidencias.length);
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const elegida = coincidencias[marcada];
                  if (elegida) void abrirCoincidencia(elegida);
                  return;
                }
                if (e.key === 'Escape') {
                  setCoincidencias([]);
                  return;
                }
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar();
              }
            }}
            onBlur={() => {
              // Con la lista abierta, el vendedor elige; no forzamos la búsqueda exacta.
              if (coincidencias.length === 0 && telefono.trim() && !cliente && !bloqueo) {
                void buscar();
              }
            }}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Los últimos 4 dígitos o el nombre alcanzan. Enter para buscar.
            </p>
            {hayCamara && !cliente && (
              <button
                type="button"
                className="boton-escanear"
                onClick={() => setEscaneando(true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3h6v2H5v4H3zm12 0h6v6h-2V5h-4zM3 15h2v4h4v2H3zm16 0h2v6h-6v-2h4zM7 7h4v4H7zm6 0h4v4h-4zM7 13h4v4H7zm6 2h2v2h-2z" />
                </svg>
                Escanear
              </button>
            )}
          </div>

          {coincidencias.length > 0 && (
            <ul className="sugerencias" role="listbox" aria-label="Clientes encontrados">
              {coincidencias.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === marcada}
                    className={`sugerencia${i === marcada ? ' marcada' : ''}`}
                    onMouseEnter={() => setMarcada(i)}
                    onClick={() => void abrirCoincidencia(c)}
                  >
                    <span className="sugerencia-quien">
                      {c.nombre}
                      <small>{c.telefono}</small>
                    </span>
                    <span className="sugerencia-pts">
                      {c.saldoPuntos}
                      <small>pts</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {buscando && <p className="text-sm text-slate-500">Buscando…</p>}

        {cliente && (
          <div className="flex items-center gap-3 rounded-xl bg-[var(--color-punto-suave)] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{cliente.cliente.nombre}</p>
              <p className="text-sm text-slate-600">{cliente.cliente.telefono}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="tabular text-2xl font-bold leading-none">{cliente.saldoPuntos}</p>
              <p className="text-xs text-slate-600">
                punto{cliente.saldoPuntos === 1 ? '' : 's'} · {cliente.equivalenteTexto}
              </p>
            </div>
          </div>
        )}

        {/* Acá se daba de alta al cliente con el cobro. Ya no: la cuenta la crea
            la persona en la app, y sin cuenta este cobro no se registra (D-060).
            El cartel dice qué hacer, porque lo va a leer en voz alta. */}
        {bloqueo && (
          <div className="aviso-sin-cuenta">
            <p className="aviso-sin-cuenta-titulo">
              {bloqueo === 'NO_EXISTE'
                ? 'Este teléfono no está en Puntos InCollege'
                : 'Esta persona todavía no tiene cuenta en la app'}
            </p>
            <p>
              La compra se suma a los puntos sólo si tiene cuenta. Que la cree ahora desde{' '}
              <strong>{window.location.host}</strong> con este mismo teléfono —son dos minutos— y
              buscás de nuevo.
            </p>
          </div>
        )}

        <SelectorDeArticulos items={items} alCambiar={setItems} />

        <div>
          <label className="etiqueta" htmlFor="importe">
            {items.length > 0 ? 'Suma de los artículos' : 'Importe de la venta'}
            {hayRecargo && <span className="font-normal text-slate-500"> · precio de lista, sin el recargo</span>}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-semibold text-slate-400">
              $
            </span>
            <input
              id="importe"
              ref={campoImporte}
              className="campo-grande pl-10"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              readOnly={items.length > 0}
              value={items.length > 0 ? formatearPesos(baseCentavos).replace('$', '') : importe}
              onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ''))}
            />
          </div>
        </div>

        <div>
          <span className="etiqueta">Forma de pago</span>
          {fallaronFormas ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">
              No se pudieron cargar las formas de pago. Recargá la página: sin saber el recargo no
              se puede cobrar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {formas.map((f, i) => (
                <button
                  key={f.codigo}
                  type="button"
                  onClick={() => setForma(f.codigo)}
                  className={`chip border ${
                    forma === f.codigo
                      ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                      : 'border-[var(--color-borde)] bg-white text-slate-700'
                  }`}
                >
                  {f.nombre}
                  {f.recargoBps > 0 && <span className="ml-1.5 font-semibold">+{f.recargoTexto}</span>}
                  {i < 9 && <span className="ml-1.5 text-[10px] opacity-60">alt+{i + 1}</span>}
                </button>
              ))}
            </div>
          )}

          {/* El desglose, antes de confirmar: el vendedor lo lee en voz alta. */}
          {hayRecargo && hayMonto && (
            <div className="desglose">
              <p>
                <span>Precio de lista</span>
                <span>{formatearPesos(baseCentavos)}</span>
              </p>
              <p>
                <span>
                  Recargo {formaElegida?.nombre.toLowerCase()} · {formaElegida?.recargoTexto}
                </span>
                <span>+{formatearPesos(recargoCentavos)}</span>
              </p>
              <p className="desglose-total">
                <span>A cobrar</span>
                <span>{formatearPesos(totalCentavos)}</span>
              </p>
            </div>
          )}

          {formaElegida && !acredita && (
            <p className="mt-2 text-sm text-slate-600">
              Se registra el cobro pero no suma puntos: los puntos son sólo por efectivo.
            </p>
          )}
        </div>

        {/* La línea se deduce de los artículos; sólo se pregunta cuando no
            hay con qué deducirla, o cuando la vendedora la quiere cambiar. */}
        {lineaDeducida && !lineaElegida ? (
          <p className="linea-deducida">
            Línea: <strong>{LINEAS.find((l) => l.valor === linea)?.texto}</strong>
            <span>
              {lineaMezclada
                ? ' · la venta mezcla líneas, se registra por la de mayor importe'
                : ' · según lo que se vendió'}
            </span>
            <button type="button" onClick={() => setLineaElegida(linea)}>
              Cambiar
            </button>
          </p>
        ) : (
          <div>
            <span className="etiqueta">
              Línea{' '}
              {!lineaDeducida && (
                <span className="font-normal text-slate-500">
                  (no hay artículos cargados para deducirla)
                </span>
              )}
            </span>
            <div className="flex gap-2">
              {LINEAS.map((l) => (
                <button
                  key={l.valor}
                  type="button"
                  onClick={() => setLineaElegida(l.valor)}
                  className={`chip border ${
                    linea === l.valor
                      ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                      : 'border-[var(--color-borde)] bg-white text-slate-700'
                  }`}
                >
                  {l.texto}
                  <span className="ml-1.5 text-[10px] opacity-60">alt+{l.tecla}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>
        )}

        <button
          className="boton-principal w-full py-4 text-lg"
          disabled={guardando || !hayMonto || bloqueo !== null || !formaElegida}
        >
          {hayRecargo && hayMonto ? `Cobrar ${formatearPesos(totalCentavos)}` : 'Registrar cobro'}
        </button>
        <p className="text-center text-xs text-slate-500">
          {bloqueo
            ? 'Sin cuenta en la app no se registra el cobro.'
            : 'Enter sigue al paso de confirmación.'}
        </p>
      </form>
    </div>
  );
}

function Comprobante({
  resultado,
  items,
  medio,
  local,
  vendedor,
  alSeguir,
}: {
  resultado: Resultado;
  items: ItemElegido[];
  medio: string;
  local: string;
  vendedor: string;
  alSeguir: () => void;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const [copiado, setCopiado] = useState(false);
  // Anular lo que se acaba de cobrar. Es el momento en que el error se nota:
  // el importe de más, el cliente equivocado de la lista. El motor lo resuelve
  // con un movimiento REVERSA, sin borrar nada (D-004, D-054).
  const [anulando, setAnulando] = useState(false);
  const [anulado, setAnulado] = useState(false);
  useEffect(() => boton.current?.focus(), []);

  if (anulado) {
    return (
      <div className="space-y-4">
        <div className="tarjeta text-center">
          <p className="text-lg font-semibold">Cobro anulado</p>
          <p className="mt-2 text-sm text-slate-600">
            {resultado.importeTexto} · {resultado.cliente.nombre}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Los puntos volvieron atrás. El cobro no se borró: queda registrado junto con su
            anulación y el motivo.
          </p>
        </div>
        <button className="boton-principal w-full py-4 text-lg" onClick={alSeguir} autoFocus>
          Nuevo cobro
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta text-center">
        <p className="text-sm text-slate-600">
          Cobro registrado · {resultado.importeTexto} · {resultado.cliente.nombre}
        </p>
        {resultado.recargoBps > 0 && (
          <p className="text-xs text-slate-500">
            {resultado.baseTexto} de lista + {resultado.recargoTexto} de recargo (
            {resultado.recargoPorcentajeTexto})
          </p>
        )}

        {resultado.acredito ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-punto-suave)] px-4 py-1.5 text-sm font-semibold text-[var(--color-tinta)]">
            +{resultado.puntosAcreditados} punto{resultado.puntosAcreditados === 1 ? '' : 's'}
            {resultado.yaAplicado && ' (ya estaba registrado)'}
          </p>
        ) : (
          <p className="mt-3 inline-flex rounded-full bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-600">
            Sin puntos: no fue en efectivo
          </p>
        )}

        <p className="tabular mt-5 text-6xl font-bold leading-none text-[var(--color-marino)]">
          {resultado.saldoPuntos}
        </p>
        <p className="mt-1 text-slate-600">
          punto{resultado.saldoPuntos === 1 ? '' : 's'} · equivalen a {resultado.equivalenteTexto}
        </p>

        {resultado.faltaParaElProximoTexto !== '$0' && (
          <p className="mt-3 text-sm text-slate-500">
            Le faltan {resultado.faltaParaElProximoTexto} en efectivo para el próximo punto.
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button ref={boton} className="boton-principal py-4 text-lg" onClick={alSeguir}>
          Nuevo cobro
        </button>
        <button className="boton-secundario py-4" onClick={() => window.print()}>
          Imprimir recibo
        </button>
        <button
          className="boton-secundario py-4"
          onClick={async () => {
            const texto = resultado.acredito
              ? `Hola ${resultado.cliente.nombre}! Sumaste puntos en InCollege. ` +
                `Tenés ${resultado.saldoPuntos} punto(s) (${resultado.equivalenteTexto}). ` +
                `Mirá tu saldo acá: ${resultado.link}`
              : `Hola ${resultado.cliente.nombre}! Esta compra no suma puntos: los puntos son ` +
                `sólo por pago en efectivo. Mirá tu cuenta acá: ${resultado.link}`;
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              window.prompt('Copiá el mensaje', texto);
            }
          }}
        >
          {copiado ? 'Copiado' : 'Copiar mensaje de WhatsApp'}
        </button>
      </div>

      {/* Discreto a propósito: se usa poco y no se puede tocar sin querer. */}
      {!anulando ? (
        <div className="text-center">
          <button
            type="button"
            className="text-xs font-medium text-slate-400 underline underline-offset-4 hover:text-[var(--color-error)]"
            onClick={() => setAnulando(true)}
          >
            Me equivoqué: anular este cobro
          </button>
        </div>
      ) : (
        <div className="tarjeta">
          <AnularCobro
            pagoId={resultado.pagoId}
            importeTexto={resultado.importeTexto}
            nombre={resultado.cliente.nombre}
            alAnular={() => setAnulado(true)}
            alCancelar={() => setAnulando(false)}
          />
        </div>
      )}

      {/* Invisible en pantalla; al imprimir es lo único que sale. */}
      <Recibo
        pagoId={resultado.pagoId}
        fecha={resultado.fecha}
        local={local}
        vendedor={vendedor}
        cliente={resultado.cliente.nombre}
        telefono={resultado.cliente.telefono}
        items={items}
        baseTexto={resultado.baseTexto}
        recargoTexto={resultado.recargoBps > 0 ? resultado.recargoTexto : null}
        recargoPorcentajeTexto={resultado.recargoPorcentajeTexto}
        totalTexto={resultado.importeTexto}
        medio={medio}
        acredito={resultado.acredito}
        puntosAcreditados={resultado.puntosAcreditados}
        saldoPuntos={resultado.saldoPuntos}
        equivalenteTexto={resultado.equivalenteTexto}
      />
    </div>
  );
}

/**
 * Confirmación antes de cobrar (D-028). Muestra lo que está por registrarse y
 * espera un sí. Enter confirma, Escape vuelve: no hace falta el mouse.
 */
function Confirmacion({
  cliente,
  telefono,
  items,
  baseTexto,
  recargoTexto,
  recargoPorcentajeTexto,
  totalTexto,
  medio,
  acredita,
  guardando,
  alConfirmar,
  alVolver,
}: {
  cliente: string | null;
  telefono: string;
  items: ItemElegido[];
  baseTexto: string;
  /** `null` cuando la forma de pago no tiene recargo (D-061). */
  recargoTexto: string | null;
  recargoPorcentajeTexto: string;
  totalTexto: string;
  medio: string;
  acredita: boolean;
  guardando: boolean;
  alConfirmar: () => void;
  alVolver: () => void;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => boton.current?.focus(), []);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') alVolver();
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [alVolver]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Confirmar el cobro</h1>

      <div className="tarjeta space-y-4">
        <div className="conf-fila">
          <span>Cliente</span>
          <strong>
            {cliente || 'Sin nombre'}
            <small>{telefono}</small>
          </strong>
        </div>

        {items.length > 0 && (
          <div>
            <span className="etiqueta">Se vendió</span>
            <ul className="conf-items">
              {items.map((i) => (
                <li key={i.clave}>
                  <span>
                    {i.cantidad > 1 && <b>{i.cantidad} × </b>}
                    {i.descripcion}
                  </span>
                  <span>{formatearPesos(i.precioUnitarioCentavos * i.cantidad)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="conf-fila">
          <span>Forma de pago</span>
          <strong>{medio}</strong>
        </div>

        {/* Con recargo se muestran las tres cifras. Sin recargo, una sola:
            repetir el mismo número tres veces es ruido. */}
        {recargoTexto && (
          <>
            <div className="conf-fila">
              <span>Precio de lista</span>
              <strong>{baseTexto}</strong>
            </div>
            <div className="conf-fila">
              <span>Recargo · {recargoPorcentajeTexto}</span>
              <strong>+{recargoTexto}</strong>
            </div>
          </>
        )}

        <div className="conf-total">
          <span>A cobrar</span>
          <strong>{totalTexto}</strong>
        </div>

        <p className={acredita ? 'conf-nota' : 'conf-nota conf-nota-gris'}>
          {acredita
            ? 'Al confirmar se acreditan los puntos.'
            : 'Este cobro se registra pero no suma puntos: no es efectivo.'}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          ref={boton}
          className="boton-principal py-4 text-lg"
          onClick={alConfirmar}
          disabled={guardando}
        >
          {guardando ? 'Registrando…' : 'Confirmar cobro'}
        </button>
        <button className="boton-secundario py-4" onClick={alVolver} disabled={guardando}>
          Volver a corregir
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Enter confirma · Escape vuelve
      </p>
    </div>
  );
}
