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
- [ ] Normalización a E.164 (`+549341...`) tolerante a formatos de carga manual
- [ ] Alta de cliente por teléfono
- [ ] Detección de duplicados
- [ ] Fusión de cuentas repetidas (conserva el libro mayor de ambas)

**Listo cuando:** cargar el mismo número en cinco formatos distintos da una sola cuenta.

## Etapa 3 — Pantalla de cobro en mostrador
- [ ] Búsqueda de cliente por teléfono + alta en la misma pantalla
- [ ] Importe cobrado y medio de pago
- [ ] Acreditación inmediata si es efectivo y saldo actualizado en pantalla
- [ ] Optimizada para velocidad: foco automático, teclado numérico, sin recargas,
      operable entera con teclado

**Listo cuando:** se registra un cobro completo en menos de quince segundos y el punto
queda acreditado.

## Etapa 4 — Pantalla de saldo del cliente
- [ ] Vista pública por token firmado (sin login)
- [ ] Saldo en puntos, equivalente en pesos, últimos movimientos, vencimiento
- [ ] Mobile primero, se abre desde un link de WhatsApp

**Listo cuando:** se ve bien en un celular y no expone datos de otros clientes.

## Etapa 5 — Canje en el mostrador
- [ ] Búsqueda por teléfono y saldo a la vista
- [ ] Canje sobre el total de la venta respetando el tope configurable
- [ ] Bloqueo de acumulación con otros beneficios (validado por el sistema)
- [ ] Concurrencia: transacción con bloqueo de fila y verificación de saldo adentro

**Listo cuando:** dos sesiones simultáneas no pueden gastar el mismo saldo.

## Etapa 6 — Panel de administración
- [ ] Configuración de tasas por línea, valor del punto, tope y fecha de vencimiento
- [ ] Listado de movimientos con filtros por local, fecha y cliente
- [ ] Totales de puntos emitidos, canjeados y vigentes (pasivo del programa)

**Listo cuando:** se puede cambiar la tasa sin tocar código ni redeployar.

## Etapa 7 — Avisos por WhatsApp
- [ ] Integración con n8n + Evolution API (webhook saliente)
- [ ] Aviso al acreditar puntos, con link a la pantalla de saldo
- [ ] Aviso previo al vencimiento

**Listo cuando:** se dispara solo, sin intervención manual.

## Etapa 8 — Vencimiento automático
- [ ] Tarea programada que vence los saldos al cerrar la temporada
- [ ] Aviso anticipado configurable

---

## Después de esta entrega (no incluido)
- Fuente de pagos de egresados (SIRO): implementar `FuenteDePagos` contra su base
  o su exportación a Excel. Ver `DECISIONES.md` § Fuente de pagos.
- Módulo de representantes y de colegios (otra mecánica).
- Tienda online y CRM.
