-- CreateTable
CREATE TABLE "CodigoDeAcceso" (
    "id" TEXT NOT NULL,
    "telefonoE164" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usadoEn" TIMESTAMP(3),

    CONSTRAINT "CodigoDeAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destacado" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "precioCentavos" BIGINT,
    "lineaDeNegocio" "LineaDeNegocio",
    "orden" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "desde" TIMESTAMP(3),
    "hasta" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destacado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodigoDeAcceso_telefonoE164_creadoEn_idx" ON "CodigoDeAcceso"("telefonoE164", "creadoEn");

-- CreateIndex
CREATE INDEX "CodigoDeAcceso_expiraEn_idx" ON "CodigoDeAcceso"("expiraEn");

-- CreateIndex
CREATE INDEX "Destacado_visible_orden_idx" ON "Destacado"("visible", "orden");

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "horarios" TEXT,
ADD COLUMN     "telefono" TEXT;

