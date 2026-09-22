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

## Después de esta entrega (no incluido)
- Fuente de pagos de egresados (SIRO): implementar `FuenteDePagos` contra su base
  o su exportación a Excel. Ver `DECISIONES.md` § Fuente de pagos.
- Módulo de representantes y de colegios (otra mecánica).
- Tienda online y CRM.
