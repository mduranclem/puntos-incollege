-- El cliente entra con su mail y su contraseña (D-036).
--
-- Se agrega, no se reemplaza: la cuenta sigue siendo el teléfono (D-010). Las
-- tres columnas van opcionales porque la mayoría de las cuentas las abre el
-- mostrador al cobrar, mucho antes de que la persona se registre en la app.

ALTER TABLE "Cliente" ADD COLUMN "email" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "contrasenaHash" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "registradoEn" TIMESTAMP(3);

-- Un mail, una cuenta. Los NULL no chocan entre sí en PostgreSQL, así que los
-- clientes sin registrar conviven sin problema.
CREATE UNIQUE INDEX "Cliente_email_key" ON "Cliente"("email");
