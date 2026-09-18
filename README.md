# Puntos InCollege

Programa de fidelización por puntos de InCollege (indumentaria escolar, Rosario).

Los clientes suman puntos **sólo pagando en efectivo en el local** y los canjean por
descuento en pesos. El objetivo del programa es doble: bajar la comisión de los medios
de pago electrónicos y que el cliente pase por el local y conozca las otras líneas.

- **Alcance de esta entrega:** uniformes y ropa lisa, con carga manual en el mostrador.
- **Fuera de alcance:** egresados (entra después como fuente de pagos, ver
  `DECISIONES.md` § D-003), representantes, colegios, tienda online, CRM.

Ver `ROADMAP.md` para el estado de cada etapa y `DECISIONES.md` para el por qué de cada
decisión.

## Cómo está armado

```
api/    Node + Express + Prisma + PostgreSQL (TypeScript)
  src/dominio/     reglas puras: dinero en centavos, teléfonos, cálculo de puntos
  src/motor/       motor de puntos, puerto FuenteDePagos, ingestor
  src/infra/       adaptadores: Prisma, memoria (tests), fuentes de pago
  src/servicios/   clientes, configuración, saldos, avisos, vencimientos
  src/http/        rutas HTTP y sesión
  tests/           tests del motor (sin base) + integración contra PostgreSQL
web/    React + Vite + Tailwind v4 (TypeScript)
  src/paginas/     Cobro, Canje, Saldo (público), Admin, Ingreso
```

Reglas que no se negocian, todas documentadas en `DECISIONES.md`:
libro mayor append-only (D-004), idempotencia por referencia del pago (D-006),
canje con bloqueo de fila (D-007), dinero en centavos con `BigInt` (D-002),
nada de valores de negocio en el código (D-009).

## Levantarlo en desarrollo

```bash
npm install
cp api/.env.example api/.env      # editar DATABASE_URL y los secretos
```

**Base de datos con Docker:**

```bash
docker compose up -d db
```

Y después:

```bash
npm run prisma:migrate --workspace=api
npm run seed --workspace=api       # locales, temporada, configuración y usuarios
npm run dev                        # API en :3001, web en :5173
```

Sin Docker (Postgres embebido, D-018). Acepta **una conexión por vez**, así que cada paso
va con la terminal anterior cerrada y el servidor recién levantado:

```bash
npm run pg:local --workspace=api        # terminal 1, dejala abierta
npm run preparar:local --workspace=api  # terminal 2: migración + seed en una conexión
# reiniciá la terminal 1 y después:
npm run dev                             # la API queda como único cliente de la base
```

En `api/.env`, `DATABASE_URL` para el Postgres embebido:
`postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`

El seed crea `admin` (PIN 1234) y `mostrador-<local>` (PIN 1111).
**Cambiar los PIN antes de usarlo en producción.**

## Trabajar desde otra computadora

El código, las decisiones y el historial de commits viajan en el repo. Lo que **no**
viaja es el historial de chat de Claude Code (es local a cada máquina) ni `api/.env`
(está ignorado, y así tiene que ser). Por eso el contexto vive en `CLAUDE.md`,
`ROADMAP.md` y `DECISIONES.md`: Claude los lee solo al abrir el proyecto en cualquier
máquina.

**La primera vez, en la computadora nueva:**

```bash
git clone https://mduranclem@github.com/mduranclem/puntos-incollege.git
cd puntos-incollege
npm ci                            # respeta package-lock.json, instala exactamente lo mismo
cp api/.env.example api/.env      # los secretos NO viajan: hay que ponerlos de nuevo
```

El `mduranclem@` adelante del dominio **no es opcional**: hay dos cuentas de GitHub en
juego y sin eso Git autentica con la otra, contra la que este repo privado responde
`Repository not found` — un 404 engañoso, porque a un repo privado no le dice "sin
permiso", le dice "no existe". Si alguna vez ves ese error, revisá esto antes que el
nombre del repo.

Después levantás la base como dice más arriba (con Docker o con el Postgres embebido) y
ya estás trabajando.

**Cada vez que te sentás a trabajar, en cualquiera de las dos:**

```bash
git pull        # traer lo que hiciste en la otra máquina
# ... trabajar ...
git push        # dejarlo disponible para la otra
```

La regla es una sola: **`git pull` al empezar y `git push` al terminar.** Si te olvidás
del push, la otra computadora queda atrás; si te olvidás del pull, vas a tener que
resolver un conflicto. Ninguna de las dos cosas pierde trabajo, pero el pull/push
ordenado evita la molestia.

Si alguna vez trabajaste en las dos sin sincronizar, `git pull` te va a pedir que unas
las dos historias. No borres nada: pedile a Claude que resuelva el conflicto.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` | Tests del motor de puntos. No necesitan base de datos. |
| `npm run simular` | Ciclo completo del motor por consola, sin base de datos. |
| `npm run probar:local --workspace=api` | Ciclo completo contra la base local, incluido el vencimiento. |
| `npm run tareas --workspace=api` | Despacho de avisos y vencimiento de temporada. |
| `npm run build` | Compila API y web. |

Los tests de integración contra PostgreSQL (`tests/integracionPostgres.test.ts`)
se saltean solos si no hay `DATABASE_URL_TEST`.

## Deploy en EasyPanel

Tres servicios sobre el mismo repositorio:

1. **API** — build `npm ci && npm run build --workspace=api`, arranque
   `npm run prisma:migrate --workspace=api && npm run start --workspace=api`.
   Variables: `DATABASE_URL`, `JWT_SECRET`, `TOKEN_CLIENTE_SECRET`, `URL_PUBLICA_WEB`,
   `CORS_ORIGEN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`.
2. **Web** — build `npm ci && npm run build --workspace=web`, sirve `web/dist` como
   estáticos con *fallback* a `index.html` (la app tiene rutas del lado del cliente) y
   `/api` ruteado a la API.
3. **Tareas** — `npm run tareas:prod --workspace=api`, con las mismas variables que la
   API. Alternativa: correrlas dentro de la API con `CRON_HABILITADO=true`.

Postgres se toma del servicio de base de datos de EasyPanel.

## Avisos por WhatsApp

La API no habla con Evolution API: publica eventos en el webhook de n8n
(`N8N_WEBHOOK_URL`) y n8n arma el mensaje y lo manda (D-014). Eventos:

| Evento | Cuándo | Campos principales |
|---|---|---|
| `puntos.acreditados` | al acreditar un cobro en efectivo | `telefono`, `nombre`, `puntos`, `saldoPuntos`, `equivalenteTexto`, `link` |
| `puntos.por_vencer` | N días antes del cierre (configurable) | `telefono`, `saldoPuntos`, `venceEn`, `diasQueFaltan`, `link` |
| `puntos.vencidos` | al cerrar la temporada | `telefono`, `puntosVencidos`, `temporada` |

El `link` es la pantalla pública de saldo, firmada y sin login.

## Lo que sigue

Los pagos de egresados entran implementando una clase `FuenteEgresados` que cumpla
`FuenteDePagos` (`api/src/motor/puertos.ts`). El motor, el libro mayor y las pantallas
no se tocan. El mapeo previsto de sus campos está en `DECISIONES.md` § D-003.
