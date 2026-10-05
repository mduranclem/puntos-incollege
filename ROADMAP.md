# ROADMAP — Puntos InCollege

Programa de fidelización por puntos de InCollege (indumentaria escolar, Rosario).

**Alcance de esta entrega:** uniformes y ropa lisa, con carga manual en el mostrador.
**Fuera de alcance:** egresados (se integra más adelante), representantes, colegios,
tienda online, CRM, catálogo de premios, app descargable.

Estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho.

---

## Etapa 1 — Motor de puntos
Modelo de datos, migraciones y la lógica de acreditar, canjear, revertir y vencer,
con sus tests. Sin interfaz.

- [x] Esquema Prisma + migración inicial
- [x] Aritmética de dinero en centavos (enteros, sin float)
- [x] Motor: acreditación con remanente
- [x] Motor: canje con tope y bloqueo de acumulación de beneficios
- [x] Motor: reversa de pago (movimiento inverso, nada se borra)
- [x] Motor: vencimiento de temporada
- [x] Idempotencia por referencia externa del pago
- [x] Puerto `FuenteDePagos` + implementación `FuenteManual`
- [x] Tests unitarios del motor
- [x] Simulación del ciclo completo por consola (`npm run simular`)

**Listo cuando:** los tests pasan y se puede simular el ciclo completo por consola. ✅ Hecho.

## Etapa 2 — Clientes y normalización de teléfonos
- [x] Normalización a E.164 (`+549341...`) tolerante a formatos de carga manual
- [x] Alta de cliente por teléfono
- [x] Detección de duplicados
- [x] Fusión de cuentas repetidas (conserva el libro mayor de ambas)

**Listo cuando:** cargar el mismo número en cinco formatos distintos da una sola cuenta. ✅ Hecho.

## Etapa 3 — Pantalla de cobro en mostrador
- [x] Búsqueda de cliente por teléfono + alta en la misma pantalla
- [x] Importe cobrado y medio de pago
- [x] Acreditación inmediata si es efectivo y saldo actualizado en pantalla
- [x] Optimizada para velocidad: foco automático, teclado numérico, sin recargas,
      operable entera con teclado

**Listo cuando:** se registra un cobro completo en menos de quince segundos y el punto
queda acreditado. ✅ Probado en el navegador contra Postgres: teléfono → Enter → nombre →
Enter → importe → Enter, sin tocar el mouse, y el saldo queda a la vista.

## Etapa 4 — Pantalla de saldo del cliente
- [x] Vista pública por token firmado (sin login)
- [x] Saldo en puntos, equivalente en pesos, últimos movimientos, vencimiento
- [x] Mobile primero, se abre desde un link de WhatsApp

**Listo cuando:** se ve bien en un celular y no expone datos de otros clientes.

## Etapa 5 — Canje en el mostrador
- [x] Búsqueda por teléfono y saldo a la vista
- [x] Canje sobre el total de la venta respetando el tope configurable
- [x] Bloqueo de acumulación con otros beneficios (validado por el sistema)
- [x] Concurrencia: transacción con bloqueo de fila y verificación de saldo adentro

**Listo cuando:** dos sesiones simultáneas no pueden gastar el mismo saldo.

## Etapa 6 — Panel de administración
- [x] Configuración de tasas por línea, valor del punto, tope y fecha de vencimiento
- [x] Listado de movimientos con filtros por local, fecha y cliente
- [x] Totales de puntos emitidos, canjeados y vigentes (pasivo del programa)

**Listo cuando:** se puede cambiar la tasa sin tocar código ni redeployar.

## Etapa 7 — Avisos por WhatsApp
- [x] Integración con n8n + Evolution API (webhook saliente)
- [x] Aviso al acreditar puntos, con link a la pantalla de saldo
- [x] Aviso previo al vencimiento

**Listo cuando:** se dispara solo, sin intervención manual. ✅ Conectado al n8n de la
empresa: workflow "Puntos InCollege - Avisos de WhatsApp", instancia `practican8nWhatsApp`.
Probado de punta a punta con un número real.

## Etapa 8 — Vencimiento automático
- [x] Tarea programada que vence los saldos al cerrar la temporada
- [x] Aviso anticipado configurable

## Etapa 9 — App del cliente (web instalable)

Que el cliente entre cuando quiera y vea todo lo de su cuenta, sin depender de que alguien
le mande un link. Web instalable en la pantalla de inicio, no app de las tiendas (D-021).
Criterio de diseño del dueño: **que se entienda, que sea fácil de usar y que no sea
invasiva**. La cuenta es el centro; lo demás va en segundo plano.

- [x] Cuenta propia con mail y contraseña, y recuperación por WhatsApp (D-036)
- [x] Acceso con teléfono + código de un solo uso por WhatsApp (D-022)
- [x] Pantalla de cuenta: saldo, equivalente, cuánto falta para el próximo, vencimiento
- [x] Historial completo de movimientos
- [x] Su número en grande para mostrar en el mostrador
- [x] Los 6 locales con dirección y horarios
- [x] Novedades y precios, editables desde el panel (catálogo de artículos, D-027)
- [x] Instalable: ícono propio, pantalla completa, sesión que no se cae
- [x] Rediseño con la identidad de la marca: credencial colegial, estados reales de
      la cuenta y jerarquía corregida del QR (D-039)

**Listo cuando:** el cliente la agrega a la pantalla de inicio, la abre días después y ve
su cuenta sin volver a identificarse.

---

## Etapa 10 — En producción

- [x] Un solo servicio con Dockerfile, la API sirve la web (D-032)
- [x] Postgres propio en EasyPanel, separado del de Evolution API
- [x] Desplegado en `https://n8n-puntos-incollege.fbf9ni.easypanel.host` con HTTPS
- [x] Migraciones al arrancar, datos iniciales cargados, seis locales con dirección real
- [x] Avisos de WhatsApp por el n8n de la empresa, probados de punta a punta
- [x] Concurrencia del canje verificada contra el PostgreSQL de producción (D-033)

**Listo cuando:** el mostrador entra desde cualquier máquina del local y el cliente abre
su cuenta desde el celular, las dos cosas por HTTPS y contra la misma base.

---

## Etapa 11 — Antes de abrirlo a los clientes

Auditoría de seguridad completa y lo que salió de ella (D-044).

- [x] El servicio no arranca sin `JWT_SECRET` y `TOKEN_CLIENTE_SECRET` propios
- [x] Límites por IP en todo lo público que manda WhatsApp o prueba credenciales
- [x] Dar de baja a alguien corta su sesión en el acto (`sesionVersion`)
- [x] Cabeceras de seguridad, con CSP ajustada a lo que la app usa de verdad
- [x] El link de acceso a una cuenta pasa a ser de gerencia
- [x] La imagen de producción deja de llevar herramientas de desarrollo
- [x] El link que sale por WhatsApp dura 7 días y se canjea al entrar (D-045)
- [x] Respaldo diario de la base configurado y probado

**Listo cuando:** ✅ Hecho, salvo mover el respaldo fuera del servidor (ver abajo).

---

## Etapa 12 — La app del cliente, terminada

- [x] Un fondo por pestaña, con la cabeza del oso alineada entre las cuatro (D-047)
- [x] Transición horizontal entre pestañas, con scroll propio por pestaña (D-047)
- [x] Ahorro acumulado real en Movimientos, calculado desde el libro mayor (D-048)

**Listo cuando:** ✅ Hecho y desplegado.

---

## Etapa 13 — La lista de precios real

- [x] Precios por talle: 4-10, 12-16, S-XL y ESP (D-049)
- [x] Las 15 prendas de la lista colegial, en 5 categorías
- [x] El mostrador pregunta el talle y el servidor resuelve el precio
- [x] Sólo gerencia edita precios, con 403 en el servidor y confirmación en el panel
- [x] Cada precio guarda quién lo cambió y cuándo
- [x] La lista se carga sola en el primer arranque, sin pisar lo editado a mano

**Listo cuando:** el mostrador cobra el precio del talle correcto en producción.
✅ Desplegado el 5/10. Verificado: 5 categorías, 15 prendas, 60 precios.

---

## Lo que falta ahora

Esto es lo primero que hay que mirar al retomar, en este orden.

**Del código, nada.** Todo lo hecho está en `main` y pasa los 99 tests.

**Hecho el 5/10:**

- [x] Desplegada la lista de precios en producción
- [x] Dominio propio: `https://puntos.tiendadeuniformes.store`, con HTTPS y las dos
      variables (`URL_PUBLICA_WEB`, `CORS_ORIGEN`) apuntadas ahí. La dirección vieja de
      easypanel sigue funcionando, así que ningún link repartido se rompe.
- [x] Respaldo de la base fuera del servidor, en Google Drive
- [x] Escaneo del QR probado con un celular real sobre HTTPS

**Lo que queda, todo depende de una acción en un panel o en un teléfono:**

- [ ] **El número de WhatsApp.** Hay un chip nuevo para el programa, aparte del personal.
      Vincular la instancia de Evolution API escaneando el QR desde ese celular, ponerle
      la foto de la tienda y apuntar ahí el nodo del workflow de n8n.
- [ ] **Sacar el link firmado del payload a n8n**, aprovechando esa misma edición.
- [ ] **Las siete cuentas de personal**, una por persona (D-034): pocho (Sur, que también
      cubre Fábrica), fernanda (Norte), gaby (Fisherton), clara (Santa Fe), jere (San
      Nicolás), y dos de gerencia. Cada uno entra una vez y pone su contraseña.
- [ ] **Después de eso, y sólo después**, desactivar las seis cuentas `mostrador-*`:
      comparten una contraseña que varias personas vieron. No se borran, se desactivan.
- [ ] Una versión de la mascota sin la ropa de egresados, si se la quiere usar en grande.

**Para salir hace falta:** el número de WhatsApp y las cuentas. Lo demás puede esperar.

---

## Después de esta entrega (no incluido)
- Fuente de pagos de egresados (SIRO): implementar `FuenteDePagos` contra su base
  o su exportación a Excel. Ver `DECISIONES.md` § Fuente de pagos.
- Módulo de representantes y de colegios (otra mecánica).
- Tienda online y CRM.
