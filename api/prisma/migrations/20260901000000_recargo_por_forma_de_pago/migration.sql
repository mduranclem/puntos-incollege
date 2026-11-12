-- Recargo por forma de pago (D-061).
-- Los precios de lista son de contado; pagar con tarjeta o QR tiene recargo, y
-- el recargo es un dato que edita la gerencia, no una constante del código (D-009).

-- El recargo con el que se cobró queda en el pago: cambiar la tasa mañana no
-- reescribe lo que alguien pagó hoy. `importeCentavos` ya lo incluye.
ALTER TABLE "Pago" ADD COLUMN "formaDePagoCodigo" TEXT;
ALTER TABLE "Pago" ADD COLUMN "recargoBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Pago" ADD COLUMN "recargoCentavos" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "FormaDePago" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "medioDePago" "MedioDePago" NOT NULL,
    "recargoBps" INTEGER NOT NULL DEFAULT 0,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "actualizadoPorId" TEXT,

    CONSTRAINT "FormaDePago_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormaDePago_codigo_key" ON "FormaDePago"("codigo");
CREATE INDEX "FormaDePago_activa_orden_idx" ON "FormaDePago"("activa", "orden");

ALTER TABLE "FormaDePago" ADD CONSTRAINT "FormaDePago_actualizadoPorId_fkey"
    FOREIGN KEY ("actualizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
