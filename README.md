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
marca/  Logotipo y mascota originales, y el script que genera los archivos de la web
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

El seed crea `admin` y `mostrador-<local>` con las contraseñas de desarrollo
`desarrollo-admin` y `desarrollo-mostrador`. El sistema pide cambiarlas al entrar (D-034).

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
| `npm run probar:concurrencia --workspace=api` | Canjes simultáneos contra un PostgreSQL real (D-007). Necesita `DATABASE_URL_TEST` con `schema=pruebas`. |
| `npm run build` | Compila API y web. |

Los tests de integración contra PostgreSQL (`tests/integracionPostgres.test.ts`)
se saltean solos si no hay `DATABASE_URL_TEST`.

## Deploy en EasyPanel

**Un solo servicio** sirve todo: el mostrador, el panel, la app del cliente y la API
(D-032). Un dominio, sin CORS ni proxy.

**1. Base de datos.** En EasyPanel, crear un servicio **Postgres**. Anotar su cadena de
conexión interna.

**2. La aplicación.** Crear un servicio **App**:

- Origen: este repositorio de GitHub, rama `main`
- Build: **Dockerfile** (está en la raíz)
- Puerto: `3001`
- Dominio: el que se vaya a usar, con HTTPS (la cámara del escáner lo exige)

**3. Variables de entorno:**

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena del Postgres de EasyPanel |
| `JWT_SECRET` | Una cadena larga y aleatoria |
| `TOKEN_CLIENTE_SECRET` | Otra distinta, larga y aleatoria |
| `URL_PUBLICA_WEB` | `https://<tu-dominio>` — arma el link que va por WhatsApp |
| `CORS_ORIGEN` | `https://<tu-dominio>` |
| `N8N_WEBHOOK_URL` | La *Production URL* del nodo Webhook del workflow de avisos |
| `N8N_WEBHOOK_TOKEN` | El mismo token que figura en el nodo "Armar el mensaje" |
| `CRON_HABILITADO` | `true` — avisos y vencimiento automático |
| `SEED_CONTRASENA_ADMIN` | Contraseña del primer gerente, mínimo 8 caracteres (D-029, D-034) |
| `SEED_CONTRASENA_VENDEDOR` | Contraseña inicial de los usuarios de mostrador |

**4. Primer arranque.** Las migraciones corren solas al levantar el contenedor; si fallan,
el contenedor no arranca, que es lo que corresponde. Después, una sola vez, cargar los
datos iniciales desde la consola del servicio:

```bash
cd /app/api && node dist/scripts/sembrar.js
```

Eso crea los seis locales, la temporada, la configuración y los usuarios. Sin
`SEED_CONTRASENA_ADMIN` y `SEED_CONTRASENA_VENDEDOR` se niega a correr.

**5. Después del despliegue.** La primera vez que entre cada uno, el sistema le va a
pedir que ponga una contraseña propia: las del seed las sabe cualquiera que tenga acceso
al panel de infraestructura (D-034). Después, correr la prueba de
concurrencia contra ese Postgres, que es el único que acepta varias conexiones.
Va desde la consola del servicio, porque la base no sale a internet:

```bash
cd /app/api && DATABASE_URL_TEST="<la cadena del Postgres>&schema=pruebas"   node dist/scripts/probarConcurrencia.js
```

**El `schema=pruebas` no es opcional.** El libro mayor es append-only: lo que esa
prueba escribe no se borra nunca, así que va en un esquema aparte y no en el de
producción. El script se niega a correr si la URL apunta a `public`.

En una máquina con un PostgreSQL propio, el mismo control corre como test:

```bash
DATABASE_URL_TEST="postgresql://..." npm test --workspace=api
```

## La marca

El logotipo y la mascota originales están en `marca/`. Lo que la web usa —el logotipo con
el fondo recortado y los íconos de la app— se genera desde ahí:

```bash
pip install pillow scipy      # no son dependencias del proyecto
python marca/generar.py
```

Se corre a mano y sólo cuando cambia la marca: los archivos generados viajan en el
repositorio (D-037). El logotipo es la marca de las pantallas; la mascota es el ícono, y
va recortada a la cara porque su buzo dice "EGRESADOS", que no participa del programa.

## Avisos por WhatsApp

La API no habla con Evolution API: publica eventos en el webhook de n8n
(`N8N_WEBHOOK_URL`) y n8n arma el mensaje y lo manda (D-014). Eventos:

| Evento | Cuándo | Campos principales |
|---|---|---|
| `puntos.acreditados` | al acreditar un cobro en efectivo | `telefono`, `nombre`, `puntos`, `saldoPuntos`, `equivalenteTexto`, `link` |
| `puntos.por_vencer` | N días antes del cierre (configurable) | `telefono`, `saldoPuntos`, `venceEn`, `diasQueFaltan`, `link` |
| `puntos.vencidos` | al cerrar la temporada | `telefono`, `puntosVencidos`, `temporada` |

El `link` es la pantalla pública de saldo, firmada y sin login.

El evento `acceso.codigo` lleva el código de un solo uso, y lo usan las tres puertas de
entrada del cliente: el acceso por teléfono (D-022), la confirmación del registro y la
recuperación de contraseña (D-036). El workflow de n8n no necesita ningún cambio: es
siempre el mismo mensaje.

## Cómo entra cada uno

| Quién | Con qué | Dónde |
|---|---|---|
| Gerente y vendedores | usuario + contraseña (D-034) | `/ingresar` |
| Cliente registrado | mail + contraseña (D-036) | `/app/entrar` |
| Cliente sin registrar | teléfono + código por WhatsApp (D-022) | `/app/entrar-con-codigo` |
| Cliente desde el aviso | link firmado, sin login (D-011) | `/s/<token>` |

La cuenta del cliente **es su teléfono** (D-010) en los cuatro casos: el mail es sólo un
nombre de usuario. Por eso registrarse pide una vez el código por WhatsApp, y por eso la
recuperación de contraseña también va por ahí y no por mail.

## Lo que sigue

Los pagos de egresados entran implementando una clase `FuenteEgresados` que cumpla
`FuenteDePagos` (`api/src/motor/puertos.ts`). El motor, el libro mayor y las pantallas
no se tocan. El mapeo previsto de sus campos está en `DECISIONES.md` § D-003.
