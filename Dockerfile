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

# Sólo lo necesario para correr: nada de código fuente ni de dependencias de build.
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/package.json ./package.json
COPY --from=compilacion /app/api/package.json ./api/package.json
COPY --from=compilacion /app/api/dist ./api/dist
COPY --from=compilacion /app/api/prisma ./api/prisma
COPY --from=compilacion /app/web/dist ./web/dist

WORKDIR /app/api
EXPOSE 3001

# Las migraciones corren al arrancar: un despliegue deja la base al día sola.
# Si fallan, el contenedor no levanta, que es lo que corresponde.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
