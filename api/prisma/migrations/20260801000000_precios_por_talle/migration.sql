-- Lista de precios por talle (D-049).
--
-- Hasta acá un artículo tenía un precio y nada más. La lista real de InCollege
-- cotiza cada prenda en cuatro talles (4-10, 12-16, S-XL y ESP), así que el
-- precio único alcanzaba para la muestra pero no para el catálogo de verdad.
--
-- Una fila por talle y no cuatro columnas: agregar un talle mañana es insertar
-- filas, no migrar la tabla. Y no son artículos separados porque "Chomba
-- bordada" es una sola prenda.
--
-- `Articulo.precioCentavos` NO se toca ni se borra: queda como precio del talle
-- base (4-10). Es lo que sigue usando todo lo que todavía no conoce los talles,
-- y evita que esta migración pueda dejar un artículo sin precio.
--
-- `codigo` permite volver a cargar la lista sin duplicar artículos: se busca por
-- código y se actualiza en su lugar. Nada se borra, porque hay ventas que
-- apuntan a estos artículos (D-004).

ALTER TABLE "Articulo" ADD COLUMN "codigo" TEXT;
ALTER TABLE "Articulo" ADD COLUMN "categoria" TEXT;
CREATE UNIQUE INDEX "Articulo_codigo_key" ON "Articulo"("codigo");
CREATE INDEX "Articulo_categoria_orden_idx" ON "Articulo"("categoria", "orden");

-- Qué talle se vendió. Opcional: las ventas viejas no lo tienen y está bien que
-- no lo tengan, porque en su momento no se preguntaba.
ALTER TABLE "ItemDeVenta" ADD COLUMN "talle" TEXT;

CREATE TABLE "PrecioPorTalle" (
    "id" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "talle" TEXT NOT NULL,
    "precioCentavos" BIGINT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "actualizadoPorId" TEXT,

    CONSTRAINT "PrecioPorTalle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrecioPorTalle_articuloId_talle_key" ON "PrecioPorTalle"("articuloId", "talle");
CREATE INDEX "PrecioPorTalle_articuloId_idx" ON "PrecioPorTalle"("articuloId");

ALTER TABLE "PrecioPorTalle" ADD CONSTRAINT "PrecioPorTalle_articuloId_fkey"
    FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrecioPorTalle" ADD CONSTRAINT "PrecioPorTalle_actualizadoPorId_fkey"
    FOREIGN KEY ("actualizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los artículos que ya existen arrancan con su precio actual en el talle base,
-- así ninguno queda sin precio mientras se carga la lista nueva.
INSERT INTO "PrecioPorTalle" ("id", "articuloId", "talle", "precioCentavos", "actualizadoEn")
SELECT gen_random_uuid()::text, "id", '4-10', "precioCentavos", NOW()
FROM "Articulo";
