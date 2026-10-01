# Puntos InCollege — un solo servicio que sirve la API y la web (D-032).
#
# Se construye desde la raíz del repositorio:
#   docker build -t puntos-incollege .
#
# En EasyPanel: origen GitHub, build "Dockerfile", puerto 3001.

# ---------- Etapa 1: dependencias e instalación ----------
FROM node:22-alpine AS dependencias
WORKDIR /app

# Sólo los manifiestos primero: si no cambian, Docker reusa la capa de npm ci.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

# ---------- Etapa 2: compilación ----------
FROM dependencias AS compilacion
WORKDIR /app
COPY . .

# El cliente de Prisma se genera antes de compilar: el código lo importa.
RUN npm run prisma:generate --workspace=api
RUN npm run build --workspace=api
RUN npm run build --workspace=web

# ---------- Etapa 3: lo que se ejecuta ----------
FROM node:22-alpine AS produccion
WORKDIR /app
ENV NODE_ENV=production

# Instalación limpia, **sin dependencias de desarrollo** (D-044).
#
# Antes esta etapa copiaba el `node_modules` entero de la compilación, así que
# la imagen de producción se llevaba vitest, vite y esbuild —con sus propias
# vulnerabilidades conocidas— para no usarlos nunca. Reinstalar desde cero es
# unos segundos más de build y saca de producción todo lo que no corre ahí.
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev

# El cliente de Prisma se genera contra este `node_modules`, que es otro.
COPY --from=compilacion /app/api/prisma ./api/prisma
RUN npx prisma generate --schema=api/prisma/schema.prisma

COPY --from=compilacion /app/api/dist ./api/dist
COPY --from=compilacion /app/web/dist ./web/dist

WORKDIR /app/api

# Nada de root: si algún día hay una ejecución remota, que no sea con todos los
# permisos del contenedor. `node` ya existe en la imagen oficial.
USER node

EXPOSE 3001

# Las migraciones corren al arrancar: un despliegue deja la base al día sola.
# Si fallan, el contenedor no levanta, que es lo que corresponde.
# Al arrancar: migraciones, después la lista de precios si nunca se cargó, y
# después la API.
#
# Dos detalles que importan. `--si-falta` hace que la carga sea una sola vez en
# la vida del servicio: sin eso, cada despliegue pisaría los precios que la
# gerencia cambió desde el panel (D-049).
#
# Y la carga va con `|| true` a propósito: es el catálogo, no el motor de
# puntos. Si fallara, la caja tiene que abrir igual — con los precios que haya.
# Un servicio que no levanta porque no pudo cargar una lista de precios es peor
# que un servicio con la lista incompleta.
CMD ["sh", "-c", "npx prisma migrate deploy && (node dist/scripts/cargarPrecios.js --si-falta || true) && node dist/main.js"]
