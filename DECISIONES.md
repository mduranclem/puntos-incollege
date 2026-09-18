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
---

## D-019 · El foco de la pantalla de cobro se maneja con efectos, no en el handler

**Contexto.** La pantalla de cobro tiene que completarse entera con el teclado. El salto
de foco (teléfono → nombre → importe) estaba escrito adentro de la función que busca al
cliente, justo después de `setEsNuevo(true)`.

**Problema encontrado probándola en el navegador:** el campo de nombre todavía no existía
en el DOM cuando se lo intentaba enfocar, así que el foco se quedaba en el teléfono y
**todo lo que tipeaba el vendedor terminaba dentro del campo del teléfono**. La pantalla
quedaba inusable justo en lo único que no puede fallar.

**Decisión.** El foco se mueve en `useEffect` disparado por el estado (`esNuevo`,
`cliente`), que corre después de que React dibujó el campo.

**Regla general.** Enfocar un campo que aparece de forma condicional va siempre en un
efecto, nunca en el mismo tick que decide mostrarlo.

---

## D-020 · El cierre de temporada es una fecha de calendario argentina, no un instante

**Contexto.** `Temporada.cierreEn` se guarda como `DateTime`. El panel lo mostraba
haciendo `cierreEn.toISOString().slice(0, 10)` —es decir, leyendo la fecha en UTC— y lo
guardaba como `new Date("AAAA-MM-DDT23:59:59").toISOString()`, en hora local.

**Problema encontrado usando la pantalla.** Argentina es UTC−3, así que las 23:59:59 del
31 de diciembre son las 02:59 del 1° de enero en UTC. El panel mostraba **01/01/2027**
cuando la temporada cerraba el 31/12/2026, y al guardar esa fecha mal leída la corría un
día **de verdad**. Guardar la configuración cinco veces movía el vencimiento cinco días.
Sobre la fecha en que vencen los puntos de todos los clientes.

**Decisión.** "Cierre de temporada" es una **fecha de calendario argentina**, no un
instante cualquiera. La conversión vive en un solo lugar (`api/src/dominio/fechas.ts`):

- `finDelDiaArgentina("2026-12-31")` → el instante `2027-01-01T02:59:59.999Z`, que es el
  final de ese día en Rosario. Es lo que se guarda.
- `fechaArgentina(instante)` → `"2026-12-31"`. Es lo que se muestra y se edita.

La API expone `cierreFecha` (AAAA-MM-DD) además del instante, y el `PUT` acepta la fecha
de calendario. El frontend no hace ninguna cuenta de zona horaria.

**Por qué offset fijo.** Argentina usa UTC−3 sin horario de verano. Si eso cambiara, ese
archivo es el único que hay que tocar.

**Consecuencia.** Un pago a las 23:00 del último día todavía entra en la temporada; uno de
las 00:30 del día siguiente ya no. Hay tests que fijan el ida y vuelta, que guardar diez
veces seguidas no mueve la fecha, y los dos casos de borde de medianoche
(`api/tests/fechas.test.ts`).

---

## D-021 · La app del cliente es una web instalable, no una app de las tiendas

**Contexto.** El pedido original decía "no hacer app descargable: es una web que se abre
desde un link de WhatsApp". El dueño cambió el rumbo: quiere que el cliente entre cuando
quiera y vea su cuenta, como en las apps de las estaciones de servicio.

**Decisión.** Una **PWA**: web instalable en la pantalla de inicio, con ícono propio, que
abre a pantalla completa y mantiene la sesión. No va a App Store ni Google Play.

**Por qué.** Lo que hace que la app de YPF se sienta app son tres cosas —sesión que no se
cae, ícono en el celular, pantalla completa sin barra del navegador— y las tres se
consiguen sin tiendas. A cambio se evitan la cuenta de desarrollador de Apple (USD 99 al
año), la revisión de Apple en cada cambio, y mantener dos builds. El negocio son seis
locales y venta de mostrador: el costo de las tiendas no se justifica todavía.

**Consecuencia.** El link de WhatsApp sigue funcionando igual (D-011): es la puerta de
entrada rápida. La app es la puerta de entrada permanente. Si algún día se quiere estar en
las tiendas, se envuelve esta misma app y se publica sin rehacerla.

---

## D-022 · El cliente entra con su teléfono y un código por WhatsApp

**Contexto.** Hasta ahora el cliente sólo veía su saldo si alguien le mandaba el link
(D-011). Para que pueda entrar cuando quiera hace falta que se identifique solo, y la
cuenta no tiene usuario ni contraseña: es el teléfono (D-010).

**Decisión.** Acceso por código de un solo uso:

1. El cliente escribe su teléfono.
2. Se genera un código de 6 dígitos, se guarda **hasheado** y se manda por WhatsApp
   **a ese mismo número**, por la cola de n8n (D-014).
3. Al ingresarlo correctamente recibe el token de cliente ya existente (D-011), que la app
   guarda. A partir de ahí entra sin pedir nada más.

**Por qué es seguro.** El teléfono *es* la cuenta, y el código viaja al teléfono. Quien no
tiene el celular no entra. Es el mismo mecanismo que usan los bancos y las billeteras, sin
inventar contraseñas que el cliente va a olvidar.

**Defensas.** El código vence a los 10 minutos, admite 5 intentos y queda inutilizable al
usarse. Se limita cuántos códigos se piden por teléfono por hora. `pedir` responde siempre
lo mismo exista o no el teléfono, así nadie puede averiguar quién es cliente.

**Consecuencia.** Mientras n8n no esté conectado, el código no se puede entregar: el
acceso propio del cliente depende de esa integración. El link que manda la vendedora
sigue funcionando sin n8n.

---

## D-023 · En el mostrador se busca por los últimos dígitos o por el nombre

**Contexto.** La identidad del cliente es el teléfono (D-010), pero hacérselo dictar
entero son diez dígitos con ruido de fondo y gente esperando: es lento y se carga mal.

**Decisión.** La pantalla de cobro decide sola cómo buscar según lo que se tipea:

| Lo que tipea el vendedor | Qué hace |
|---|---|
| 8 dígitos o más | Resolución exacta, instantánea, sin lista. El camino de siempre. |
| 3 a 7 dígitos | Busca ese fragmento en el teléfono y muestra una lista corta. Los que **terminan** así van primero: "los últimos cuatro" es la instrucción fácil de dar. |
| Letras | Busca por nombre. |

La lista trae nombre, teléfono y saldo, se navega con las flechas y se elige con Enter:
la pantalla sigue siendo operable sin mouse, que es la regla de esta pantalla.

**Por qué no un código corto propio.** Se evaluó darle a cada cliente un código de 6
caracteres. Se descartó: le agrega algo nuevo que recordar o buscar, y no gana nada
contra lo que ya sabe de memoria, que es su propio número.

**Consecuencia.** El tope de resultados es 8: si hay más, el vendedor tipea un dígito
más. Nunca hay una lista larga para leer en el mostrador.

---

## D-024 · El escáner de QR va en el celular del vendedor, no en la caja

**Contexto.** Las computadoras de los locales no tienen cámara, y comprar seis cámaras
para probar una idea no se justifica. Pero los vendedores tienen celular.

**Decisión.** La misma pantalla de cobro, abierta en el celular del vendedor, ofrece
escanear el QR que muestra el cliente en su app. El botón aparece **sólo si el dispositivo
tiene cámara**: en la PC de la caja no se ve y no molesta.

**Y el cobro se completa en el celular.** No se construye un puente "escaneo en el
teléfono y aparece en la computadora": eso obliga a emparejar dispositivos y mantenerlos
sincronizados, mucha maquinaria para ahorrar unos segundos. El celular es, simplemente,
otra caja — y una que tiene cámara.

**Qué lleva el QR: el teléfono, nada más.** No una credencial de la cuenta. Si el QR
llevara acceso, alguien que le saca una foto a la pantalla del cliente en la cola entraría
a su cuenta; llevando el teléfono, lo peor que consigue es un número. Así el QR es sólo
*una forma rápida de tipear lo que el vendedor iba a tipear igual*: sin permisos nuevos,
sin superficie nueva que proteger, y anda aunque el cliente esté sin señal en el local.

---

## D-025 · El canje no tiene tope, salvo el total de la venta

**Contexto.** El pedido original fijaba un tope del 10% de la compra. El dueño lo cambió:
si al cliente le alcanzan los puntos para pagar una prenda entera, que la pague.

**Decisión.** El tope configurable pasa a 100% por defecto, y se le suma un **segundo
límite que no depende de la configuración**: el descuento nunca puede superar el total de
la venta (`topeDeLaVenta`). Si alguien configura 200%, sigue siendo el total.

**Por qué ese segundo límite.** El programa descuenta, no paga: no puede devolver plata en
efectivo ni dejar un saldo a favor en la caja. Un cliente con 50 puntos que compra una
chomba de $26.950 descuenta $26.950 y conserva el resto de los puntos.

**Consecuencia.** El tope sigue siendo configurable —se puede volver al 10% desde el panel
sin tocar código (D-009)— pero el límite duro está en el dominio y no se puede desactivar.

---

## D-026 · Gerente y vendedor, y el alta de personal desde el panel

**Contexto.** Los roles existían como `ADMINISTRADOR` y `VENDEDOR`, pero no había forma de
dar de alta a nadie sin entrar a la base, y la empresa habla de "gerente".

**Decisión.** `ADMINISTRADOR` se renombra a **`GERENTE`**: el sistema usa la palabra de la
empresa, no la del programador. Y la gerencia da de alta al personal desde el panel,
eligiendo rol y local.

**Qué ve cada uno:**

| | Vendedor | Gerente |
|---|---|---|
| Cobrar y canjear | Sí | Sí |
| Pasivo del programa, totales, plata movida | **No** | Sí |
| Movimientos de todos los locales | **No** | Sí |
| Configuración del programa | **No** | Sí |
| Alta y baja de personal | **No** | Sí |

La separación no es sólo visual: las rutas del panel exigen el rol en el servidor, así que
un vendedor que escriba la URL a mano recibe 403.

**Dos reglas del alta.** Nadie se borra, se desactiva: los movimientos que hizo tienen que
seguir apuntando a alguien (D-004). Y siempre tiene que quedar al menos un gerente activo:
el sistema no deja que la empresa se cierre la puerta sola.

---

## D-027 · Qué se vendió: un catálogo, ítems en cada venta y registro diario

**Contexto.** El dueño quiere saber qué se vendió, con su monto, tanto cuando se cobra
plata como cuando se canjean puntos, y ver un registro diario en el panel de gerencia.

**El riesgo.** La pantalla de cobro es la que no puede tardar más de quince segundos. Si
para cada venta hay que tipear descripciones, el programa muere ahí.

**Decisión.** Un **catálogo de artículos** con su precio, que se toca en botones. La
vendedora elige "Chomba bordada" y el sistema suma $26.950: **no tipea ningún importe**,
así que cargar el detalle es *más rápido* que lo que hacía antes, no más lento. Para lo
que no está en la lista hay una opción "Otro" a mano.

**El catálogo es uno solo.** La misma lista alimenta los botones del mostrador y las
Novedades que ve el cliente en su app: dos usos, un lugar donde mantenerlo. Por eso
`Destacado` pasó a llamarse `Articulo`, con dos interruptores separados (`activo` para el
mostrador, `visibleEnApp` para el cliente).

**El precio lo pone el servidor.** La pantalla manda qué artículo y cuántos; el precio
sale del catálogo en el backend. Una pantalla no puede inventar precios.

**Los ítems guardan el nombre y el precio del momento.** Si mañana cambia el precio de
lista, la venta de ayer no se reescribe — mismo criterio que con la tasa de puntos (D-009).

**Cuelgan de las dos cosas.** `ItemDeVenta` se ata al pago cuando se cobró plata, o al
movimiento cuando se canjearon puntos, así el registro diario ve la operación completa.

**El día es un día argentino** (D-020): las ventas del martes terminan a la medianoche de
Rosario, no a las 21 por estar leyendo en UTC.

**Consecuencia.** El total de la venta pasa a salir del detalle cuando hay ítems: no puede
haber un importe que no coincida con lo que dice que se vendió. El campo de importe suelto
sigue existiendo para las ventas sin detalle.

---

## D-028 · Se confirma antes de cobrar

**Contexto.** La pantalla de cobro registraba en cuanto se apretaba el botón. Un error de
tipeo o un artículo de más quedaba cobrado, y para arreglarlo había que anular.

**Decisión.** Un paso de confirmación que muestra lo que está por registrarse —cliente,
qué se vendió, medio de pago y total— y espera un sí.

**Sin perder la velocidad.** Es la pantalla que no puede pasar de quince segundos, así que
el botón de confirmar viene enfocado: **Enter confirma, Escape vuelve a corregir**. La
secuencia completa sigue siendo sin mouse: teléfono → Enter → tocar artículos → Enter →
Enter.

**Consecuencia.** El cobro pasa de un paso a dos. Se gana que la vendedora vea el total
antes de decirlo en voz alta, y que corregir sea volver atrás en vez de anular un
movimiento del libro mayor.
