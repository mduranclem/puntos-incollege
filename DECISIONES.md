# DECISIONES — Puntos InCollege

Registro de decisiones de arquitectura y de negocio. Cada decisión anota el contexto,
la decisión y la consecuencia. Se agrega al final; no se reescribe la historia.

---

## D-000 · Repositorio nuevo, no módulo de un sistema existente

**Contexto.** Se revisó el directorio de trabajo: está vacío, sin repositorio git, sin
`package.json`, sin código previo. El único sistema existente de la empresa es el de
gestión de escritorio de egresados ("SIRO", Windows, módulos de Personas, Tablas,
Listados y Contratos de Venta), que es de terceros, no se sabe si tiene API y no es
extensible por nosotros.

**Decisión.** Aplicación nueva, repositorio nuevo. No hay convenciones previas que
seguir, así que rigen las decisiones técnicas del pedido.

**Consecuencia.** El sistema de egresados queda como *fuente externa de pagos* a
integrar más adelante (ver D-003), no como plataforma anfitriona.

---

## D-001 · Monorepo con dos paquetes: `api` y `web`

**Decisión.** Workspaces de npm: `api/` (Node + Express + Prisma + PostgreSQL) y
`web/` (React + Vite + Tailwind). TypeScript en ambos.

**Por qué.** Un solo repo, un solo deploy coordinado en EasyPanel, tipos de la API
compartibles con el frontend sin publicar paquetes.

**Consecuencia.** En EasyPanel se despliegan dos servicios (API y estáticos del web)
apuntando al mismo repositorio con distinto build.

---

## D-002 · El dinero es entero en centavos; los puntos son enteros

**Decisión.** Todo importe se guarda y se opera como cantidad entera de **centavos**,
en `BigInt` (columna `BigInt` de Prisma, `bigint` de JavaScript). Los puntos son
enteros con signo. Nunca `float`, nunca `Number` para plata.

**Por qué.** `Number` es IEEE-754: `0.1 + 0.2 !== 0.3`. Además, con la inflación
argentina un `Int` de 32 bits (máximo ≈ $21.474.836) se queda corto para importes de
planes de egresados. `BigInt` no tiene ese techo.

**Consecuencia.** La serialización JSON convierte `bigint` a string en el borde HTTP
(en `api/src/http/app.ts`); el frontend formatea desde string. El parseo de importes que
tipea el vendedor vive en un solo lugar (`dominio/dinero.ts`).

---

## D-003 · Los pagos entran por un puerto `FuenteDePagos`

**Contexto.** Hoy los pagos de uniformes y ropa lisa se cargan a mano en el mostrador.
Los de egresados viven en el sistema de escritorio de terceros y se van a integrar más
adelante; todavía no se sabe si expone API o si hay que leerle la base o sus
exportaciones a Excel.

**Decisión.** El motor de puntos **no sabe de dónde viene un pago**. Toda entrada pasa
por un puerto:

```ts
// api/src/motor/puertos.ts
export type PagoNormalizado = {
  referenciaExterna: string;   // idempotencia. Única en todo el sistema.
  ocurridoEn: Date;
  importeCentavos: bigint;
  medioDePago: MedioDePago;    // EFECTIVO acredita; el resto se registra y no acredita
  lineaDeNegocio: LineaDeNegocio;
  localCodigo: string;
  cliente: { telefonoCrudo: string; nombre?: string; documento?: string };
  metadata?: Record<string, unknown>; // crudo de la fuente, para auditoría
};

export type Cursor = { desde: Date | null; ultimaReferencia: string | null };

export interface FuenteDePagos {
  readonly nombre: string;                       // 'manual' | 'siro' | ...
  traerPagosNuevos(cursor: Cursor, limite: number): Promise<{
    pagos: PagoNormalizado[];
    cursor: Cursor;
  }>;
}
```

Un `IngestorDePagos` toma cualquier `FuenteDePagos`, normaliza el teléfono, resuelve o
crea el cliente y llama al motor. El motor recibe siempre un `PagoNormalizado`.

**Hoy se implementa una sola fuente:** `FuenteManual`, que lee los pagos cargados en el
mostrador. La pantalla de cobro necesita respuesta inmediata, así que el alta del pago y
su ingesta ocurren en la misma transacción HTTP; la ingesta por lotes (`procesarPendientes`)
existe igual y es el camino que va a usar la fuente de egresados.

**Cómo va a entrar egresados (no se construye ahora).** El sistema de escritorio expone
por cada cobro: número correlativo único de 8 dígitos, concepto del medio de pago con
valores predefinidos (el efectivo figura como `"EFECTIVO"`), fecha, importe, y número de
cliente con nombre y teléfono. El mapeo previsto:

| Campo del sistema de egresados | Campo de `PagoNormalizado` |
|---|---|
| correlativo de 8 dígitos | `referenciaExterna` = `` `siro:${correlativo}` `` |
| concepto | `medioDePago` (tabla de equivalencias; `"EFECTIVO"` → `EFECTIVO`) |
| fecha | `ocurridoEn` |
| importe | `importeCentavos` |
| número de cliente + nombre + teléfono | `cliente` |
| — | `lineaDeNegocio` = `EGRESADOS` |

Los cobros en efectivo de ese sistema impactan en el momento, así que un *polling* corto
alcanza; si no hay API ni acceso a la base, la primera versión puede leer la exportación
a Excel de Listados. En cualquiera de los tres casos cambia sólo la clase que implementa
`FuenteDePagos`: **el motor, el libro mayor y las pantallas no se tocan**.

**Consecuencia.** `referenciaExterna` es única a nivel base de datos. La fuente manual
usa `manual:<uuid>` y la de egresados `siro:<correlativo>`; no pueden colisionar.

---

## D-004 · Libro mayor, no saldo mutable

**Decisión.** `Movimiento` es inmutable y append-only. El saldo de puntos es
`SUM(puntos)` sobre los movimientos de la cuenta. Nunca hay `UPDATE` sobre un campo de
saldo como forma de cambiar el saldo.

`CuentaPuntos.saldoCacheado` y `CuentaPuntos.remanenteCentavos` existen **sólo como
caché** derivada del libro mayor, recalculada dentro de la misma transacción que escribe
el movimiento. Un test verifica que la caché coincide siempre con la suma de movimientos.

**Consecuencia.** Anular un pago no borra nada: genera un movimiento `REVERSA`. Ajustes
manuales generan `AJUSTE` con motivo obligatorio.

---

## D-005 · El remanente también se deriva del libro mayor

**Contexto.** El remanente en pesos que no completa un punto es *estado*, y el estado
mutable es justo lo que D-004 prohíbe.

**Decisión.** Cada movimiento guarda `remanenteResultanteCentavos`: el remanente de la
cuenta **después** de ese movimiento. El remanente vigente es el del último movimiento.
La columna en `CuentaPuntos` es caché, igual que el saldo.

**Aritmética de la acreditación** (`cpp` = centavos por punto de la línea, configurable):

```
base    = remanenteAnterior + importe
puntos  = base / cpp            (división entera)
remanente = base − puntos × cpp
```

**Aritmética de la reversa** (inversa exacta y lineal, así funciona aunque hayan entrado
otros pagos en el medio):

```
remanente' = remanenteActual − importe + puntosOriginales × cpp
si remanente' < 0:                      # la cuenta ya gastó ese remanente
    puntosExtra = ceil(−remanente' / cpp)
    remanente'  += puntosExtra × cpp
    se devuelven (puntosOriginales + puntosExtra) puntos
```

**Invariante que verifican los tests:** con tasa constante,
`Σ importes acreditables = saldoDePuntosEmitidos × cpp + remanente`.

**Nota.** La reversa puede dejar el saldo de puntos en negativo si el cliente ya canjeó
puntos que provenían de un pago que después se anuló. Es correcto: refleja una deuda
real del cliente con el programa y queda visible en el panel. No se compensa sola ni se
esconde.

---

## D-006 · Idempotencia por `referenciaExterna`

**Decisión.** Restricción única sobre `Pago.referenciaExterna` y sobre
`Movimiento.referenciaExterna` para los movimientos de tipo `ACREDITACION`. Reintentar
la acreditación del mismo pago no crea un segundo movimiento: devuelve el existente.

**Por qué.** Un vendedor que hace doble click, un reintento de red, o un *poller* de
egresados que relee el mismo correlativo, no pueden duplicar puntos.

**Consecuencia.** La operación es segura de reintentar (`at-least-once` de la fuente,
`exactly-once` en el efecto).

---

## D-007 · Concurrencia del canje: bloqueo de fila dentro de la transacción

**Decisión.** El canje corre en una transacción con `SELECT ... FOR UPDATE` sobre la
fila de `CuentaPuntos`, recalcula el saldo desde los movimientos **dentro** de la
transacción, valida tope y saldo, y recién ahí inserta el movimiento. Nivel de
aislamiento `ReadCommitted` + bloqueo explícito.

**Por qué.** Dos cajas atendiendo al mismo cliente al mismo tiempo no pueden gastar el
mismo saldo. La validación fuera de la transacción es una condición de carrera.

---

## D-008 · Un solo beneficio por operación, validado por el sistema

**Contexto.** El canje no se acumula con el 10% de descuento por pago contado ni con la
bonificación del 50% de la primera cuota.

**Decisión.** La operación de canje recibe explícitamente qué otros beneficios se
aplicaron a esa venta (`beneficiosAplicados: BeneficioComercial[]`). Si viene alguno
distinto de vacío, el canje se rechaza con error de negocio. No es una advertencia ni
queda a criterio del vendedor: la API devuelve 422 y el movimiento no se escribe.

**Consecuencia.** La pantalla de canje obliga al vendedor a declarar los beneficios
antes de habilitar el botón. El campo queda registrado en el movimiento para auditoría.

---

## D-009 · Nada de valores de negocio hardcodeados

**Decisión.** Tasa de acumulación por línea de negocio, valor del punto, tope de canje y
fecha de cierre de temporada viven en la tabla `Configuracion` (+ `TasaAcumulacion` por
línea), editable desde el panel. La configuración es **versionada**: editar crea una
versión nueva con `vigenteDesde`; no se pisa la anterior.

Además, cada movimiento guarda los valores aplicados en el momento
(`centavosPorPuntoAplicado`, `valorPuntoAplicadoCentavos`). Cambiar la tasa mañana no
reescribe lo que pasó ayer.

**Valores iniciales del *seed*** (no son constantes del código; son datos):
$10.000 por punto en todas las líneas, punto = $1.000, tope de canje 10%.

---

## D-010 · Identidad del cliente: el teléfono, normalizado a E.164

**Decisión.** La cuenta es el número de teléfono. Sin usuario ni contraseña. Se guarda
normalizado a E.164 (`+5493415551234`) en una columna única, y además se guarda el texto
crudo que tipeó el vendedor para auditoría.

**Reglas de normalización para números argentinos** (`dominio/telefono.ts`):
espacios, guiones, puntos y paréntesis se descartan; `00` inicial → `+`; se saca el `0`
de larga distancia; se saca el `15` que va después del código de área; se agrega `+54`
si falta y el `9` de móvil si falta. `0341 15 555-1234`, `15 555 1234` (con área por
defecto del local), `+54 9 341 555 1234` y `3415551234` resuelven a la misma cuenta.

El código de área por defecto se configura **por local** (`Local.codigoAreaPorDefecto`:
341 Rosario, 342 Santa Fe, 336 San Nicolás), porque un número corto tipeado en Santa Fe
no es el mismo que uno tipeado en Rosario.

**Consecuencia.** Si dos cuentas terminan siendo la misma persona, se **fusionan**: los
movimientos se reasignan a la cuenta sobreviviente y la absorbida queda marcada como
fusionada, nunca borrada (D-004).

---

## D-011 · Acceso del cliente por token firmado, sin login

**Decisión.** El cliente abre su saldo desde un link de WhatsApp:
`https://.../s/<token>`. El token es un JWT firmado con HMAC (`TOKEN_CLIENTE_SECRET`),
con `sub` = id del cliente y vigencia larga (configurable, por defecto 180 días).

**Por qué no un id secuencial:** cambiar un número en la URL no puede mostrar el saldo de
otro cliente. La firma lo impide.

**Consecuencia.** La vista pública devuelve sólo los datos de ese cliente y nunca su
documento completo. Si un token se filtra, se rota el secreto o se sube la versión del
token del cliente (`Cliente.tokenVersion`).

---

## D-012 · Autenticación de vendedores: usuario + PIN

**Contexto.** El pedido exige registrar quién hizo cada operación, en qué local y cuándo,
pero no define el mecanismo de login del personal.

**Decisión.** Usuario con PIN numérico (hash con `bcrypt`) y sesión JWT de 12 horas que
incluye el local. Roles `VENDEDOR` y `ADMINISTRADOR`. Se eligió PIN y no contraseña
porque se tipea en un mostrador con gente esperando.

**Consecuencia.** Un vendedor está atado a un local por sesión; el local queda en cada
movimiento sin que el vendedor tenga que elegirlo.

---

## D-013 · El vencimiento también vence el remanente

**Contexto.** El pedido dice que los puntos vencen en la fecha de cierre de temporada,
pero no aclara qué pasa con el remanente en pesos que no llegó a completar un punto.

**Decisión.** Al cerrar la temporada, el movimiento `VENCIMIENTO` lleva el saldo a cero y
deja `remanenteResultanteCentavos = 0`. La temporada nueva arranca limpia.

**Por qué.** El remanente es un fragmento de punto: si el punto vence, el fragmento
también. Lo contrario obligaría a arrastrar valor entre temporadas con tasas distintas.

**Reversible sin refactor:** es una línea en `motorPuntos.vencerTemporada`.

---

## D-014 · Avisos por WhatsApp: webhook a n8n, no Evolution API directo

**Decisión.** La API no habla con Evolution API. Publica eventos
(`puntos.acreditados`, `puntos.por_vencer`, `puntos.vencidos`) por HTTP POST a un webhook
de n8n (`N8N_WEBHOOK_URL`, con `N8N_WEBHOOK_TOKEN`), y n8n decide plantilla, número de
instancia y reintentos.

**Por qué.** n8n y Evolution API ya están funcionando en la empresa y el equipo edita los
mensajes ahí sin tocar el código ni redeployar.

**Consecuencia.** Los envíos se encolan en `EventoSaliente` y se reintentan con *backoff*;
si n8n está caído, el cobro **no falla**. El aviso nunca bloquea la caja.

---

## D-015 · Tests: unitarios del motor sobre un adaptador en memoria

**Decisión.** El motor de puntos se prueba contra un repositorio en memoria que respeta
los mismos contratos que el de Prisma (unicidad de `referenciaExterna`, bloqueo de
cuenta). Los tests corren con `vitest`, sin base de datos, en cualquier máquina.

Además hay tests de integración contra PostgreSQL (unicidad real, `FOR UPDATE` real,
canje concurrente) que **se saltean solos** si no hay `DATABASE_URL_TEST`.

**Por qué.** El motor tiene que poder probarse en cualquier notebook del equipo. Las
garantías que sólo puede dar el motor de base de datos se prueban aparte, contra
PostgreSQL de verdad, en el entorno donde haya uno.

**Estado.** Los 45 tests unitarios pasan. Los de integración (`tests/integracionPostgres.test.ts`)
quedaron escritos y sin correr: prueban concurrencia real, y para eso hace falta un
PostgreSQL con varias conexiones (ver D-018). Correlos con `DATABASE_URL_TEST` apuntando
al Postgres de desarrollo o de *staging*.

---

## D-016 · Al cerrar una temporada se abre la siguiente sola

**Contexto.** El vencimiento cierra la temporada. Si no hubiera otra abierta, al
día siguiente el mostrador no podría acreditar nada (la cuenta de puntos vive en una
temporada).

**Decisión.** La tarea de vencimiento, después de vencer y cerrar, abre la temporada
siguiente si no hay ninguna abierta y copia la configuración vigente a la nueva
temporada. Las fechas quedan editables desde el panel.

**Consecuencia.** El programa no se corta solo un 1° de enero. La fecha de cierre real
la define administración desde el panel cuando decide el calendario de la temporada.

---

## D-017 · Los avisos se despachan desde una cola, nunca en el pedido del cobro

**Decisión.** `EventoSaliente` guarda los avisos y una tarea los postea a n8n con
reintentos y *backoff* exponencial (1, 2, 4, 8, 16, 32 minutos, hasta 6 intentos).

**Por qué.** Si n8n o WhatsApp están lentos, la caja no puede quedar esperando. El
cobro termina; el aviso sale cuando salga.

**Consecuencia.** Cada aviso tiene una clave única (`acreditacion:<pagoId>`,
`porvencer:<temporada>:<cuenta>`), así que reintentar la tarea no manda el mensaje dos
veces. El panel muestra el estado de la cola.

---

## D-018 · Postgres embebido para poder probar sin instalar nada

**Contexto.** El sistema se desarrolló en una máquina sin PostgreSQL ni Docker. Sin base
no se puede verificar nada de lo que realmente importa: que las migraciones apliquen, que
las consultas sean válidas y que el flujo del mostrador funcione punta a punta.

**Decisión.** `npm run pg:local --workspace=api` levanta PGlite (PostgreSQL compilado a
WASM) hablando el protocolo de Postgres en el puerto 5432. Prisma y la API se conectan
sin cambiar una línea de código.

**Qué se verificó así:** migración inicial aplicada sobre PostgreSQL 18, alta de cliente,
acreditación con remanente, idempotencia del cobro repetido, cobro con tarjeta que no
acredita, canje con tope y con beneficio declarado, anulación con movimiento inverso,
saldo público por token (y 404 con token adulterado), totales del panel, control de
caché contra el libro mayor, y vencimiento de temporada con apertura de la siguiente.

**Dos defectos aparecieron sólo al correrlo de verdad**, y por eso valió la pena:

1. El bloqueo de fila comparaba `id = $1::uuid` contra una columna de texto: PostgreSQL
   tiraba `operator does not exist: text = uuid` y **ninguna acreditación funcionaba**.
2. Al cerrar la temporada, si el nombre de la nueva coincidía con una existente, el
   `upsert` devolvía la vieja y **el sistema quedaba sin temporada abierta**.

**Límites.** PGlite acepta una conexión por vez, así que no sirve para probar
concurrencia: los tests de canje simultáneo necesitan un Postgres de verdad (D-015).
Para desarrollo con Docker está `docker-compose.yml`, y en producción va el Postgres de
EasyPanel.