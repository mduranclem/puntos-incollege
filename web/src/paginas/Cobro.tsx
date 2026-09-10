/**
 * Pantalla de cobro en el mostrador.
 *
 * Se usa con gente esperando: se completa entera con el teclado, sin mouse y sin
 * recargas. Teléfono → Enter → importe → Enter → listo. El medio de pago arranca
 * en EFECTIVO, que es el caso que interesa al programa.
 */
import { useEffect, useRef, useState } from 'react';
import { api, ErrorApi, leerSesion, type ResumenDeCuenta } from '../api';

type Linea = 'UNIFORMES' | 'ROPA_LISA';
type Medio =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO'
  | 'QR'
  | 'BILLETERA_VIRTUAL';

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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const campoTelefono = useRef<HTMLInputElement>(null);
  const campoNombre = useRef<HTMLInputElement>(null);
  const campoImporte = useRef<HTMLInputElement>(null);

  useEffect(() => campoTelefono.current?.focus(), []);

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

  async function buscar() {
    if (!telefono.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const datos = await api<{ encontrado: boolean } & Partial<ResumenDeCuenta>>(
        `/clientes/buscar?telefono=${encodeURIComponent(telefono)}`,
      );
      if (datos.encontrado) {
        setCliente(datos as ResumenDeCuenta);
        setEsNuevo(false);
        setNombre('');
        campoImporte.current?.focus();
      } else {
        setCliente(null);
        setEsNuevo(true);
        campoNombre.current?.focus();
      }
    } catch (e) {
      setCliente(null);
      setEsNuevo(false);
      setError(e instanceof ErrorApi ? e.message : 'No se pudo buscar el teléfono');
    } finally {
      setBuscando(false);
    }
  }

  async function registrar() {
    if (!telefono.trim() || !importe.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const datos = await api<Resultado>('/cobros', {
        cuerpo: {
          telefono,
          nombre: nombre.trim() || undefined,
          importe,
          medioDePago: medio,
          lineaDeNegocio: linea,
          referencia,
        },
      });
      setResultado(datos);
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
    setMedio('EFECTIVO');
    setCliente(null);
    setEsNuevo(false);
    setResultado(null);
    setError(null);
    setReferencia(nuevaReferencia());
    setTimeout(() => campoTelefono.current?.focus(), 0);
  }

  if (resultado) {
    return <Comprobante resultado={resultado} alSeguir={nuevoCobro} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">Cobrar</h1>
        <span className="text-sm text-slate-500">{sesion?.localNombre}</span>
      </div>

      <form
        className="tarjeta space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void registrar();
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
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar();
              }
            }}
            onBlur={() => {
              if (telefono.trim() && !cliente && !esNuevo) void buscar();
            }}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Enter para buscar. Da igual cómo lo escribas: con 0, con 15, con guiones.
          </p>
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

        <div>
          <label className="etiqueta" htmlFor="importe">
            Importe cobrado
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
              value={importe}
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

        <button className="boton-principal w-full py-4 text-lg" disabled={guardando || !importe}>
          {guardando ? 'Registrando…' : 'Registrar cobro'}
        </button>
        <p className="text-center text-xs text-slate-500">
          Enter registra el cobro desde cualquier campo.
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
