-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LineaDeNegocio" AS ENUM ('UNIFORMES', 'ROPA_LISA', 'EGRESADOS');

-- CreateEnum
CREATE TYPE "MedioDePago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'QR', 'BILLETERA_VIRTUAL', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoDeMovimiento" AS ENUM ('ACREDITACION', 'CANJE', 'VENCIMIENTO', 'REVERSA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('VENDEDOR', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "OrigenDePago" AS ENUM ('MANUAL', 'SIRO');

-- CreateEnum
CREATE TYPE "EstadoDePago" AS ENUM ('PENDIENTE', 'ACREDITADO', 'NO_ACREDITABLE', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoDeEvento" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "Local" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoAreaPorDefecto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'VENDEDOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localId" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "telefonoE164" TEXT NOT NULL,
    "telefonoCrudo" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "localOrigenId" TEXT,
    "fusionadoEnId" TEXT,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Temporada" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicioEn" TIMESTAMP(3) NOT NULL,
    "cierreEn" TIMESTAMP(3) NOT NULL,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Temporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaPuntos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "temporadaId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saldoCacheado" INTEGER NOT NULL DEFAULT 0,
    "remanenteCentavos" BIGINT NOT NULL DEFAULT 0,
    "cacheActualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaPuntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimiento" (
    "id" TEXT NOT NULL,
    "secuencia" BIGSERIAL NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "tipo" "TipoDeMovimiento" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "montoOrigenCentavos" BIGINT,
    "remanenteResultanteCentavos" BIGINT NOT NULL DEFAULT 0,
    "referenciaExterna" TEXT,
    "centavosPorPuntoAplicado" BIGINT,
    "valorPuntoAplicadoCentavos" BIGINT,
    "movimientoRevertidoId" TEXT,
    "motivo" TEXT,
    "metadata" JSONB,
    "localId" TEXT,
    "usuarioId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "referenciaExterna" TEXT NOT NULL,
    "origen" "OrigenDePago" NOT NULL DEFAULT 'MANUAL',
    "estado" "EstadoDePago" NOT NULL DEFAULT 'PENDIENTE',
    "importeCentavos" BIGINT NOT NULL,
    "medioDePago" "MedioDePago" NOT NULL,
    "lineaDeNegocio" "LineaDeNegocio" NOT NULL,
    "ocurridoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),
    "clienteId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "movimientoId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulado" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorPuntoCentavos" BIGINT NOT NULL,
    "topeCanjeBps" INTEGER NOT NULL,
    "diasAvisoVencimiento" INTEGER NOT NULL DEFAULT 30,
    "temporadaId" TEXT,
    "creadoPorId" TEXT,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasaAcumulacion" (
    "id" TEXT NOT NULL,
    "configuracionId" TEXT NOT NULL,
    "lineaDeNegocio" "LineaDeNegocio" NOT NULL,
    "centavosPorPunto" BIGINT NOT NULL,

    CONSTRAINT "TasaAcumulacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoSaliente" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "EstadoDeEvento" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoError" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEn" TIMESTAMP(3),
    "claveUnica" TEXT,

    CONSTRAINT "EventoSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Local_codigo_key" ON "Local"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_telefonoE164_key" ON "Cliente"("telefonoE164");

-- CreateIndex
CREATE INDEX "Cliente_fusionadoEnId_idx" ON "Cliente"("fusionadoEnId");

-- CreateIndex
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Temporada_nombre_key" ON "Temporada"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPuntos_clienteId_temporadaId_key" ON "CuentaPuntos"("clienteId", "temporadaId");

-- CreateIndex
CREATE UNIQUE INDEX "Movimiento_secuencia_key" ON "Movimiento"("secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "Movimiento_movimientoRevertidoId_key" ON "Movimiento"("movimientoRevertidoId");

-- CreateIndex
CREATE INDEX "Movimiento_cuentaId_creadoEn_idx" ON "Movimiento"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "Movimiento_creadoEn_idx" ON "Movimiento"("creadoEn");

-- CreateIndex
CREATE INDEX "Movimiento_localId_creadoEn_idx" ON "Movimiento"("localId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Movimiento_tipo_referenciaExterna_key" ON "Movimiento"("tipo", "referenciaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_referenciaExterna_key" ON "Pago"("referenciaExterna");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_movimientoId_key" ON "Pago"("movimientoId");

-- CreateIndex
CREATE INDEX "Pago_estado_origen_idx" ON "Pago"("estado", "origen");

-- CreateIndex
CREATE INDEX "Pago_ocurridoEn_idx" ON "Pago"("ocurridoEn");

-- CreateIndex
CREATE INDEX "Pago_clienteId_ocurridoEn_idx" ON "Pago"("clienteId", "ocurridoEn");

-- CreateIndex
CREATE INDEX "Configuracion_vigenteDesde_idx" ON "Configuracion"("vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "TasaAcumulacion_configuracionId_lineaDeNegocio_key" ON "TasaAcumulacion"("configuracionId", "lineaDeNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "EventoSaliente_claveUnica_key" ON "EventoSaliente"("claveUnica");

-- CreateIndex
CREATE INDEX "EventoSaliente_estado_proximoIntentoEn_idx" ON "EventoSaliente"("estado", "proximoIntentoEn");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_localOrigenId_fkey" FOREIGN KEY ("localOrigenId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_fusionadoEnId_fkey" FOREIGN KEY ("fusionadoEnId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPuntos" ADD CONSTRAINT "CuentaPuntos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPuntos" ADD CONSTRAINT "CuentaPuntos_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaPuntos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_movimientoRevertidoId_fkey" FOREIGN KEY ("movimientoRevertidoId") REFERENCES "Movimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimiento" ADD CONSTRAINT "Movimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "Movimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TasaAcumulacion" ADD CONSTRAINT "TasaAcumulacion_configuracionId_fkey" FOREIGN KEY ("configuracionId") REFERENCES "Configuracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

