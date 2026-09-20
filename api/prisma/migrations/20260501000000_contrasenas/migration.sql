-- El personal entra con contraseña, no con PIN (D-034).
--
-- La columna se renombra en lugar de crearse de cero: el hash de bcrypt de un
-- PIN es un hash válido de contraseña, así que nadie se queda afuera durante el
-- despliegue. Pero un PIN de seis dígitos no es una contraseña aceptable, así
-- que todos los que ya existen quedan obligados a cambiarla la próxima vez que
-- entren.

ALTER TABLE "Usuario" RENAME COLUMN "pinHash" TO "contrasenaHash";

ALTER TABLE "Usuario" ADD COLUMN "debeCambiarContrasena" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN "contrasenaCambiadaEn" TIMESTAMP(3);

-- Los que ya estaban tienen un PIN: que pongan contraseña al entrar.
UPDATE "Usuario" SET "debeCambiarContrasena" = true;
