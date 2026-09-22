# Instrucciones para Claude — Puntos InCollege

Programa de fidelización por puntos de InCollege (indumentaria escolar, Rosario).
Los clientes suman puntos **sólo pagando en efectivo en el local** y los canjean por
descuento en pesos.

## Antes de tocar nada

Leé, en este orden:

1. `ROADMAP.md` — qué etapa está hecha y qué falta.
2. `DECISIONES.md` — el por qué de cada decisión (D-000 a D-037). **Es la fuente de
   verdad del proyecto.** Si vas a contradecir una decisión, leela entera primero y
   decilo explícitamente.
3. `README.md` — cómo levantarlo y cómo se despliega.

Cuando tomes una decisión nueva que no sea obvia, agregala al final de `DECISIONES.md`
con el mismo formato (contexto / decisión / consecuencia) y numeración corrida. No
reescribas las decisiones viejas: se agrega al final.

## Reglas que no se negocian

El motor de puntos maneja plata. Estas reglas están en `DECISIONES.md` con el detalle;
acá va el resumen para que no se rompan por descuido:

- **Libro mayor append-only** (D-004). El saldo es `SUM(puntos)` sobre `Movimiento`.
  Nunca un `UPDATE` sobre un campo de saldo para cambiarlo. `saldoCacheado` y
  `remanenteCentavos` son **caché** que se recalcula desde los movimientos.
- **El remanente también se deriva del libro mayor** (D-005): cada movimiento guarda
  `remanenteResultanteCentavos`.
- **Nada se borra** (D-004). Anular un pago genera un movimiento `REVERSA`. Nunca
  `DELETE`, nunca editar un movimiento.
- **Idempotencia** por `(tipo, referenciaExterna)` única (D-006). Reintentar cualquier
  operación tiene que ser inofensivo.
- **Concurrencia del canje** (D-007): transacción con `SELECT ... FOR UPDATE` sobre la
  cuenta y verificación del saldo **adentro** de la transacción.
- **Plata en centavos, `BigInt`** (D-002). Nunca `float`, nunca `Number` para importes.
- **Nada de valores de negocio en el código** (D-009). Tasa por línea, valor del punto,
  tope de canje y fecha de cierre salen de la tabla `Configuracion`.
- **Los pagos entran por el puerto `FuenteDePagos`** (D-003). El motor no sabe de dónde
  viene un pago. Así entra egresados después sin refactor.
- **Nadie entra sin contraseña propia** (D-034). El personal usa usuario + contraseña; la
  que puso otro obliga a cambiarla al entrar y el servidor devuelve 403 en todo lo que
  opera hasta que eso pase.
- **La cuenta del cliente es su teléfono** (D-010, D-036). Desde D-036 entra con mail y
  contraseña, pero el mail es sólo un nombre de usuario: el teléfono es lo que ata los
  puntos a una persona. Por eso registrarse pide una vez el código por WhatsApp, y por eso
  recuperar la contraseña también va por ahí y no por mail.

Si tocás el motor (`api/src/motor/`, `api/src/dominio/`), corré `npm test` y que pasen
los 75 tests antes de dar nada por hecho.

## Convenciones

- **Todo el texto de la interfaz en español rioplatense** ("tenés", "cargá", "el
  vendedor"). El código y los nombres de dominio también van en español.
- Un commit por unidad de trabajo, con mensaje descriptivo que explique **por qué**, no
  sólo qué. Mirá `git log` para el tono.
- Al terminar una etapa, marcá en `ROADMAP.md` qué quedó hecho.
- No inventes datos de prueba que parezcan clientes reales. Si necesitás precios, usá
  los reales: remera lisa $9.900, remera estampada $12.650, chomba bordada $26.950, buzo
  cuello redondo con frisa bordado $29.700, campera canguro con frisa bordada $41.800.
- **Ojo con los avisos de prueba.** Un teléfono inventado puede ser de una persona real.
  En desarrollo `CRON_HABILITADO=false`, así que los eventos quedan encolados y no salen;
  verificá que siga así antes de probar cobros o códigos.
- La marca está en `marca/` y los archivos que usa la web se generan con
  `marca/generar.py` (D-037). La mascota va **sólo como ícono**, recortada a la cara: su
  buzo dice "EGRESADOS", que no participa del programa.

## Fuera de alcance (no construir sin que lo pidan)

Egresados (entra después como `FuenteDePagos`, ver D-003), módulo de representantes,
módulo de colegios, tienda online, CRM, catálogo de premios, app descargable.

## Levantarlo

Ver `README.md`. Dos caminos según la máquina:

- **Con Docker:** `docker compose up -d db`, después `npm run prisma:migrate --workspace=api`
  y `npm run seed --workspace=api`.
- **Sin Docker** (Postgres embebido, D-018): `npm run pg:local --workspace=api` en una
  terminal y `npm run preparar:local --workspace=api` en otra. Acepta **una conexión por
  vez**: la API tiene que quedar como único cliente de la base.

`npm test` y `npm run simular` no necesitan base de datos.

## Estado

Desplegado y funcionando en `https://n8n-puntos-incollege.fbf9ni.easypanel.host`
(EasyPanel, adentro del proyecto `n8n`; la base es el servicio `puntos-db`).

La dirección pelada es **la del cliente**; el mostrador y el panel cuelgan de
`/mostrador` (D-038).

Los tests de concurrencia del canje ya corrieron contra el PostgreSQL real y pasan
(D-033): `api/src/scripts/probarConcurrencia.ts`, desde la consola del servicio y contra
el esquema `pruebas`, nunca contra `public`. Era la única regla del pedido sin evidencia.

Lo que queda pendiente, y es del dueño, no del código:

- Cargar el catálogo real de artículos; hoy están los cinco precios de muestra.
- Probar el escaneo del QR con un celular de verdad sobre HTTPS.
- Una versión de la mascota sin la ropa de egresados, si se la quiere usar en grande.
