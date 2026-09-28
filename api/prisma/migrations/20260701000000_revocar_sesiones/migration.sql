-- Sesiones revocables (D-044).
--
-- Hasta acá, dar de baja a alguien era una intención y no un efecto: el JWT
-- seguía siendo válido hasta 12 horas, así que un ex-empleado podía seguir
-- cobrando. Lo mismo con bajarle el rol o cambiarle la contraseña.
--
-- Con esto, cada pedido compara la versión que trae el token contra la de la
-- base. Arranca en 1 para todos; sube cuando hay que cortar el acceso.

ALTER TABLE "Usuario" ADD COLUMN "sesionVersion" INTEGER NOT NULL DEFAULT 1;
