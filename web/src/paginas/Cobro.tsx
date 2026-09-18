/**
 * Pantalla de cobro en el mostrador.
 *
 * Se usa con gente esperando: se completa entera con el teclado, sin mouse y sin
 * recargas. Teléfono → Enter → importe → Enter → listo. El medio de pago arranca
 * en EFECTIVO, que es el caso que interesa al programa.
 */
import { useEffect, useRef, useState } from 'react';
import {
  api,
  ErrorApi,
  formatearPesos,
  itemsParaLaApi,
  leerSesion,
  totalDeItems,
  type ItemElegido,
  type ResumenDeCuenta,
} from '../api';
import { Escaner, useHayCamara } from '../componentes/Escaner';
import { SelectorDeArticulos } from '../componentes/SelectorDeArticulos';

type Linea = 'UNIFORMES' | 'ROPA_LISA';
type Medio =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO'
  | 'QR'
  | 'BILLETERA_VIRTUAL';

type Coincidencia = {
  id: string;
  nombre: string;
  telefono: string;
  telefonoE164: string;
  saldoPuntos: number;
};

type Resultado = ResumenDeCuenta & {
  pagoId: string;
  acredito: boolean;
  yaAplicado: boolean;
  puntosAcreditados: number;
  clienteNuevo: boolean;
  importeTexto: string;
  link: string;
};

const MEDIOS: Array<{ valor: Medio; texto: string; tecla: string }> = [
  { valor: 'EFECTIVO', texto: 'Efectivo', tecla: '1' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia', tecla: '2' },
  { valor: 'TARJETA_DEBITO', texto: 'Débito', tecla: '3' },
  { valor: 'TARJETA_CREDITO', texto: 'Crédito', tecla: '4' },
  { valor: 'QR', texto: 'QR', tecla: '5' },
  { valor: 'BILLETERA_VIRTUAL', texto: 'Billetera', tecla: '6' },
];

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
  const [nombre, setNombre] = useState('');
  const [importe, setImporte] = useState('');
  const [medio, setMedio] = useState<Medio>('EFECTIVO');
  const [linea, setLinea] = useState<Linea>('UNIFORMES');
  const [referencia, setReferencia] = useState(nuevaReferencia);

  const [cliente, setCliente] = useState<ResumenDeCuenta | null>(null);
  const [esNuevo, setEsNuevo] = useState(false);
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
  const campoNombre = useRef<HTMLInputElement>(null);
  const campoImporte = useRef<HTMLInputElement>(null);

  useEffect(() => campoTelefono.current?.focus(), []);

  // El foco tiene que saltar al campo siguiente DESPUÉS de que React lo dibuje:
  // el campo de nombre recién existe cuando el cliente es nuevo.
  useEffect(() => {
    if (esNuevo) campoNombre.current?.focus();
  }, [esNuevo]);

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

    if (cliente || esNuevo || !buscable) {
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
  }, [telefono, cliente, esNuevo]);

  // Atajos: Alt+número para el medio de pago, Alt+U / Alt+R para la línea.
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (!evento.altKey) return;
      const porMedio = MEDIOS.find((m) => m.tecla === evento.key);
      if (porMedio) {
        evento.preventDefault();
        setMedio(porMedio.valor);
        return;
      }
      const porLinea = LINEAS.find((l) => l.tecla === evento.key.toLowerCase());
      if (porLinea) {
        evento.preventDefault();
        setLinea(porLinea.valor);
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

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
        setEsNuevo(true);
      }
    } catch (e) {
      setCliente(null);
      setEsNuevo(false);
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
    setEsNuevo(false);
    setNombre('');
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

  /** Con artículos elegidos, el total lo manda el detalle (D-027). */
  const totalCentavos = items.length > 0 ? totalDeItems(items) : 0;
  const hayMonto = items.length > 0 || importe.trim() !== '';

  async function registrar() {
    if (!telefono.trim() || !hayMonto || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const datos = await api<Resultado>('/cobros', {
        cuerpo: {
          telefono,
          nombre: nombre.trim() || undefined,
          ...(items.length > 0 ? { items: itemsParaLaApi(items) } : { importe }),
          medioDePago: medio,
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
    setNombre('');
    setImporte('');
    setItems([]);
    setConfirmando(false);
    setMedio('EFECTIVO');
    setCliente(null);
    setEsNuevo(false);
    setCoincidencias([]);
    setResultado(null);
    setError(null);
    setReferencia(nuevaReferencia());
    setTimeout(() => campoTelefono.current?.focus(), 0);
  }

  if (resultado) {
    return <Comprobante resultado={resultado} alSeguir={nuevoCobro} />;
  }

  if (confirmando) {
    return (
      <Confirmacion
        cliente={cliente?.cliente.nombre ?? nombre.trim() ?? null}
        telefono={cliente?.cliente.telefono ?? telefono}
        clienteNuevo={esNuevo}
        items={items}
        totalTexto={items.length > 0 ? formatearPesos(totalCentavos) : `$${importe}`}
        medio={MEDIOS.find((m) => m.valor === medio)?.texto ?? medio}
        acredita={medio === 'EFECTIVO'}
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
          if (telefono.trim() && hayMonto) setConfirmando(true);
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
              setEsNuevo(false);
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
              if (coincidencias.length === 0 && telefono.trim() && !cliente && !esNuevo) {
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

        {esNuevo && (
          <div className="rounded-xl border border-dashed border-[var(--color-borde)] p-4">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Cliente nuevo. Se da de alta con este cobro.
            </p>
            <label className="etiqueta" htmlFor="nombre">
              Nombre (opcional)
            </label>
            <input
              id="nombre"
              ref={campoNombre}
              className="campo"
              autoComplete="off"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  campoImporte.current?.focus();
                }
              }}
            />
          </div>
        )}

        <SelectorDeArticulos items={items} alCambiar={setItems} />

        <div>
          <label className="etiqueta" htmlFor="importe">
            {items.length > 0 ? 'Total de la venta' : 'Importe cobrado'}
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
              value={items.length > 0 ? formatearPesos(totalCentavos).replace('$', '') : importe}
              onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ''))}
            />
          </div>
        </div>

        <div>
          <span className="etiqueta">Medio de pago</span>
          <div className="flex flex-wrap gap-2">
            {MEDIOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setMedio(m.valor)}
                className={`chip border ${
                  medio === m.valor
                    ? 'border-[var(--color-marino)] bg-[var(--color-marino)] text-white'
                    : 'border-[var(--color-borde)] bg-white text-slate-700'
                }`}
              >
                {m.texto}
                <span className="ml-1.5 text-[10px] opacity-60">alt+{m.tecla}</span>
              </button>
            ))}
          </div>
          {medio !== 'EFECTIVO' && (
            <p className="mt-2 text-sm text-slate-600">
              Se registra el cobro pero no suma puntos: los puntos son sólo por efectivo.
            </p>
          )}
        </div>

        <div>
          <span className="etiqueta">Línea</span>
          <div className="flex gap-2">
            {LINEAS.map((l) => (
              <button
                key={l.valor}
                type="button"
                onClick={() => setLinea(l.valor)}
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

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>
        )}

        <button className="boton-principal w-full py-4 text-lg" disabled={guardando || !hayMonto}>
          Registrar cobro
        </button>
        <p className="text-center text-xs text-slate-500">
          Enter sigue al paso de confirmación.
        </p>
      </form>
    </div>
  );
}

function Comprobante({ resultado, alSeguir }: { resultado: Resultado; alSeguir: () => void }) {
  const boton = useRef<HTMLButtonElement>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => boton.current?.focus(), []);

  return (
    <div className="space-y-4">
      <div className="tarjeta text-center">
        <p className="text-sm text-slate-600">
          Cobro registrado · {resultado.importeTexto} · {resultado.cliente.nombre}
        </p>

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

        <p className="mt-4 text-xs text-slate-500">
          Vencen el{' '}
          {new Date(resultado.temporada.venceEn).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button ref={boton} className="boton-principal py-4 text-lg" onClick={alSeguir}>
          Nuevo cobro
        </button>
        <button
          className="boton-secundario py-4"
          onClick={async () => {
            const texto =
              `Hola ${resultado.cliente.nombre}! Sumaste puntos en InCollege. ` +
              `Tenés ${resultado.saldoPuntos} punto(s) (${resultado.equivalenteTexto}). ` +
              `Mirá tu saldo acá: ${resultado.link}`;
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
  clienteNuevo,
  items,
  totalTexto,
  medio,
  acredita,
  guardando,
  alConfirmar,
  alVolver,
}: {
  cliente: string | null;
  telefono: string;
  clienteNuevo: boolean;
  items: ItemElegido[];
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
            {clienteNuevo && <em className="conf-nuevo">nuevo</em>}
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
          <span>Medio de pago</span>
          <strong>{medio}</strong>
        </div>

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
