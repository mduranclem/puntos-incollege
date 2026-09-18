-- El catálogo de novedades pasa a ser el catálogo de artículos (D-027):
-- una sola lista para los botones del mostrador y para la app del cliente.
ALTER TABLE "Destacado" RENAME TO "Articulo";
ALTER TABLE "Articulo" RENAME COLUMN "titulo" TO "nombre";
ALTER TABLE "Articulo" RENAME COLUMN "visible" TO "visibleEnApp";
ALTER TABLE "Articulo" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Articulo" DROP COLUMN "desde";
ALTER TABLE "Articulo" DROP COLUMN "hasta";
UPDATE "Articulo" SET "precioCentavos" = 0 WHERE "precioCentavos" IS NULL;
ALTER TABLE "Articulo" ALTER COLUMN "precioCentavos" SET NOT NULL;

ALTER INDEX IF EXISTS "Destacado_pkey" RENAME TO "Articulo_pkey";
DROP INDEX IF EXISTS "Destacado_visible_orden_idx";
CREATE INDEX "Articulo_activo_orden_idx" ON "Articulo"("activo", "orden");
CREATE INDEX "Articulo_visibleEnApp_orden_idx" ON "Articulo"("visibleEnApp", "orden");

-- Qué se vendió en cada operación.
CREATE TABLE "ItemDeVenta" (
    "id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precioUnitarioCentavos" BIGINT NOT NULL,
    "subtotalCentavos" BIGINT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articuloId" TEXT,
    "pagoId" TEXT,
    "movimientoId" TEXT,

    CONSTRAINT "ItemDeVenta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItemDeVenta_pagoId_idx" ON "ItemDeVenta"("pagoId");
CREATE INDEX "ItemDeVenta_movimientoId_idx" ON "ItemDeVenta"("movimientoId");
CREATE INDEX "ItemDeVenta_creadoEn_idx" ON "ItemDeVenta"("creadoEn");

ALTER TABLE "ItemDeVenta" ADD CONSTRAINT "ItemDeVenta_articuloId_fkey"
  FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemDeVenta" ADD CONSTRAINT "ItemDeVenta_pagoId_fkey"
  FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemDeVenta" ADD CONSTRAINT "ItemDeVenta_movimientoId_fkey"
  FOREIGN KEY ("movimientoId") REFERENCES "Movimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
