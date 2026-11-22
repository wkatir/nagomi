# Documentación técnica de Nagomi

Referencia técnica de la tienda. La instalación y el despliegue están en el [README](../README.md).

## Arquitectura

| Capa | Detalle |
|---|---|
| Aplicación | TanStack Start + Router + Query (React 19), SSR en Cloudflare Workers. El panel (`/admin`) se renderiza solo en el navegador. |
| API | Hono montado en `/api` (`src/routes/api/$.ts`, aplicación en `src/server/app.ts`), con cliente tipado `hc<Api>`. |
| Datos | Cloudflare D1 (SQLite) con Drizzle ORM. Esquema en `src/db/schema/` (un módulo por área) y `src/db/auth-schema.ts` (generado por Better Auth). |
| Archivos | Bucket R2 `MEDIA`, servido por el Worker en `/media/<sha256>.<ext>`. |
| Idiomas | Paraglide JS: `es` (base, sin prefijo) y `en` (`/en`); textos en `messages/*.json`. |
| Interfaz | shadcn/ui + Tailwind 4, fuentes Inter y Noto Serif JP. |
| Autenticación | Better Auth con correo y contraseña, roles mediante el plugin admin e inicio con Google opcional para el personal. |

Las reglas puras viven en `src/server/domain/*.ts`, cada una con sus pruebas. Cada error que una regla de la base puede lanzar se responde como `409` con un código (`src/server/domain/db-errors.ts`).

## Dinero, fechas y registros

- El dinero se guarda en enteros de la unidad menor de la moneda (centavos para USD). Los costos de lote usan centésimas de centavo (`unit_cost_e4`) para repartir el envío entre unidades; los reportes redondean una sola vez.
- Los instantes se guardan en UTC. Los días calendario (fechas de pedido, recepciones, estimados de entrega, reportes) usan `store_settings.time_zone`.
- Cada enum es un `CHECK` de su columna.
- Los registros del negocio no se borran: no hay borrados en cascada y los triggers rechazan `DELETE` en pedidos, pagos, devoluciones, compras, recepciones, lotes, bitácoras, clientes y direcciones. Marcas, categorías, productos, variantes, fotos, sets y proveedores se archivan.
- Cada escritura del panel es un solo `batch` de D1 (una transacción) junto con su fila en `audit_events` (usuario, acción, entidad y datos en JSON).
- La búsqueda ignora tildes y mayúsculas: las filas buscables guardan una `search_key` normalizada (`src/server/domain/search.ts`).

## API

Toda la API está bajo `/api`. Los textos se piden con `locale` (`es` o `en`) y caen al idioma por defecto; el dinero va en unidades menores.

### Tienda (pública)

| Ruta | Uso |
|---|---|
| `GET /store` | Datos de la tienda: moneda, país, IVA, métodos de pago, promesas, identidad legal, páginas del pie y redes. |
| `GET /home` | Diapositivas, colecciones de portada, sets y productos destacados, categorías. |
| `GET /products` | Listado con `q`, `category`, `brand`, `collection`, `minPrice`, `maxPrice`, `availability`, `sort`, `page`, `pageSize` (hasta 60); devuelve facetas y rango de precios. |
| `GET /products/:slug` | Ficha completa: textos, especificaciones, variantes, fotos, sets, colecciones y relacionados. |
| `GET /products/:slug/reviews` | Reseñas aprobadas, promedio y distribución. |
| `GET /navigation`, `/categories/:slug`, `/brands`, `/collections`, `/bundles` | Menú y páginas de categoría, marca, colección y set. |
| `GET /shipping/zones`, `GET /shipping/quote` | Zonas de envío y cotización por municipio. |
| `GET /pages/:slug` | Páginas legales y de ayuda publicadas. |
| `/cart` | Carrito: `GET`, `POST /cart/items`, `PATCH` y `DELETE /cart/items/:id`, `PUT` y `DELETE /cart/coupon`. |
| `POST /checkout` | Crea el pedido. |
| `GET /orders/:code`, `POST /orders/:code/pay` | Consulta del pedido y nuevo enlace de pago con tarjeta. |
| `POST /payments/wompi/webhook` | Notificación de pago de Wompi. |
| `POST /stock-alerts` | Aviso de reposición. |

### Cuenta del cliente

Bajo `/api/account`, con sesión de cliente (401 sin sesión, 403 para el personal). Un cliente solo lee y cambia sus propias filas.

- `GET`/`PATCH /profile`, `PUT /consents`.
- `GET`/`POST /addresses`, `PATCH /addresses/:id`, `POST /addresses/:id/default`, `DELETE /addresses/:id` (archiva).
- `GET /orders`, `GET /orders/:code`.
- `GET /reviews`, `PUT /reviews/:slug`, `GET /wishlist`, `PUT`/`DELETE /wishlist/:slug`.

### Panel

Bajo `/api/admin`, con sesión de personal. Módulos: `dashboard`, `products`, `product-images`, `media`, `brands`, `categories`, `bundles`, `collections`, `home-slides`, `promotions`, `orders`, `followups`, `customers`, `reviews`, `stock-alerts`, `shipping-zones`, `inventory`, `suppliers`, `purchase-orders`, `reports`, `exports`, `audit-events`, `settings` y `search`.

- Los listados son páginas `{ items, total, page, pageSize, pageCount }` con `page`, `pageSize` (10, 25, 50 o 100), `sort` (lista blanca por módulo), `dir` y `q`. Las bitácoras que solo crecen (movimientos, auditoría, archivos) son feeds `{ items, nextCursor }`.
- El esquema zod de cada listado (`src/lib/schemas/<módulo>.ts`) lo usan a la vez la ruta Hono y la pantalla, así que la URL de la pantalla es la consulta que valida el servidor.
- Las exportaciones CSV (`/api/admin/exports/...`) son RFC 4180 en UTF-8 con BOM, protegen contra inyección de fórmulas y están limitadas a 10 por minuto por usuario (`EXPORT_LIMITER`).

## Carrito y checkout

- El carrito vive en el servidor (`carts`, `cart_items`), identificado por la cookie httpOnly `nagomi_cart` (60 días). No guarda precios: cada lectura lo valora con el catálogo actual (`priceCart`, `src/server/domain/cart.ts`).
- Al iniciar sesión, el carrito de invitado se une al del cliente sumando cantidades, cada una limitada al stock y a `max_quantity_per_line`.
- Totales: subtotal, descuento del cupón, envío según el municipio (tarifa de la zona, gratis desde `free_shipping_from` sobre subtotal menos descuento) y el IVA incluido (`total × tasa / (1 + tasa)`, tasa 13 %).
- Métodos de pago con su motivo de no disponibilidad: tarjeta requiere las llaves de Wompi; transferencia, los datos bancarios; contra entrega, una dirección en la zona metropolitana y un total de hasta US$150.
- `POST /api/checkout` valida cada campo (`422 invalid_fields` con un código por campo), responde `409 cart_changed` si una línea dejó de estar disponible y `409 promotion_invalid` con el motivo. Está limitado por IP (`ORDER_LIMITER`, 10 por minuto) y es idempotente: un reintento con la misma `idempotencyKey` devuelve el mismo pedido.
- El checkout exige aceptar el aviso de privacidad y los términos, y ofrece consentimientos opcionales de marketing por correo y WhatsApp. Cada consentimiento apunta a la versión exacta de la página mostrada.
- La página `/pedido/<código>` lee el pedido de la API, nunca de la URL. El navegador que lo creó lo abre con una cookie firmada; otro navegador necesita el correo del pedido.

## Política de stock

- El stock no se guarda: es la suma de `inventory_movements` por lote. La bitácora solo crece y un trigger rechaza cualquier movimiento que deje un lote bajo cero (`lot_balance_negative`).
- Tipos de movimiento: `receive`, `return` y `cancellation` (positivos), `sale` y `waste` (negativos), `adjustment` (cualquier signo). Mermas y ajustes requieren un motivo.
- Las unidades salen de los lotes al crear el pedido, en orden FIFO (`allocateLines`, `src/server/domain/cart-pricing.ts`). Pedido, líneas, movimientos de venta, uso del cupón, consentimientos y vaciado del carrito son un solo batch: si otro pedido tomó las últimas unidades, todo se revierte y el cliente recibe `409 insufficient_stock`.
- Al cancelar un pedido pendiente o pagado, un trigger devuelve cada unidad al lote del que salió y libera el cupón.
- Una variante tiene stock bajo cuando sus unidades están en su `reorder_point` o por debajo, o en `store_settings.low_stock_threshold` si no tiene punto propio.

## Ciclo de vida del pedido

La máquina de estados está en `src/server/domain/order-state.ts` y la misma tabla en el trigger `orders_status_transition`.

| Desde | Hacia | Condición |
|---|---|---|
| `pending` | `paid` | Pagos confirmados por al menos el total. |
| `pending` | `shipped` | Solo contra entrega; requiere repartidor y fecha de envío. |
| `pending` | `cancelled` | Devuelve el stock y libera el cupón. |
| `paid` | `shipped` | Requiere repartidor y fecha de envío. |
| `paid` | `cancelled` | Queda con reembolso pendiente hasta registrarlo. |
| `shipped` | `delivered` | Requiere el pago completo (en contra entrega, el efectivo registrado). |

- `delivered` y `cancelled` son finales: nada del pedido cambia después (`order_is_final`).
- Los términos del pedido (cliente, dirección, zona, método de pago, precios, descuento, IVA, estimado de entrega) no cambian después de crearlo (`order_terms_locked`). `total = subtotal - descuento + envío` es un `CHECK`.
- Cada cambio de estado escribe una fila en `order_status_history`.
- Los pedidos con tarjeta o transferencia sin pago se cancelan pasado el plazo (`followup_pending_payment_hours`, 48 h) con `POST /api/admin/orders/expire-pending`, el botón de la pantalla de seguimiento. Contra entrega nunca se cancela así.
- Seguimiento (vista `order_followups`): `collect_payment` para pendientes con tarjeta o transferencia (48 h), `ship` para pagados y contra entrega pendientes (24 h), `confirm_delivery` para enviados (96 h).
- Las devoluciones son para pedidos enviados o entregados; cada línea se reingresa al stock o se da de baja.

## Pagos con tarjeta (Wompi El Salvador)

- `src/server/payments/wompi.ts` obtiene un token OAuth2 (client credentials) de `https://id.wompi.sv/connect/token` y crea un enlace de pago con `POST https://api.wompi.sv/EnlacePago`, con el código del pedido como identificador, el total en dólares, monto no editable, la URL de regreso `/pedido/<código>?pago=tarjeta` y el webhook `/api/payments/wompi/webhook`.
- El pedido guarda el enlace y un pago pendiente. `POST /api/orders/:code/pay` genera un enlace nuevo para un pedido con tarjeta pendiente.
- Verificación del webhook: el encabezado `wompi_hash` debe ser el HMAC-SHA256 (hexadecimal en minúsculas) del cuerpo sin modificar, firmado con el API Secret; si no coincide se responde `401 invalid_signature`.
- Un identificador de transacción ya registrado no cambia nada; un resultado rechazado no registra nada; el pedido debe ser con tarjeta y con exactamente el mismo total (`409 amount_mismatch`). El pago queda confirmado y el pedido pasa a `paid` en el mismo batch. La redirección del navegador nunca cambia el pedido.
- Secretos: `WOMPI_CLIENT_ID` (App ID) y `WOMPI_CLIENT_SECRET` (API Secret), ambos o ninguno. En modo de desarrollo del panel de Wompi se aprueba toda tarjeta de prueba excepto con CVV 111.

## Roles y permisos

Los roles se guardan en el usuario de Better Auth: `customer`, `support` (atención al cliente) y `admin`. Un trigger rechaza cualquier otro valor y ningún rol de personal se asigna desde el registro.

Cada llamada a `/api/admin/*` pasa por `requireStaff` (401 sin sesión, 403 si no es personal) y por `requireArea` según el prefijo (`src/server/routes/admin/areas.ts`, `accessTo` en `src/lib/roles.ts`). El administrador tiene todas las áreas; atención al cliente:

| Área | Prefijos | Atención al cliente |
|---|---|---|
| dashboard | `/dashboard` | sin acceso |
| catalog | `/products`, `/product-images`, `/media`, `/brands`, `/categories`, `/bundles` | lectura |
| merchandising | `/collections`, `/home-slides`, `/promotions` | sin acceso |
| orders | `/orders`, `/followups` | escritura, incluidos cambios de estado |
| customers | `/customers` | escritura |
| shipping | `/shipping-zones` | lectura |
| inventory | `/inventory` | sin acceso |
| purchasing | `/suppliers`, `/purchase-orders` | sin acceso |
| reports | `/reports`, `/exports` | sin acceso |
| audit | `/audit-events` | sin acceso |
| settings | `/settings` | sin acceso |
| search | `/search` | lectura |

- Los costos nunca se envían a atención al cliente.
- El panel usa el mismo `accessTo` para ocultar secciones y redirigir; atención al cliente entra directamente a `/admin/orders`.
- Inicio de sesión limitado a 5 intentos y registro a 3 por minuto por IP; las sesiones duran 7 días. Google solo permite entrar a cuentas de personal que ya existen.

## Seguridad

- `hono/csrf` en toda la API y verificación de origen de Better Auth.
- Encabezados en cada respuesta: CSP (en modo report-only), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` y `Permissions-Policy`; `Cache-Control: no-store` en `/api/admin` y `/api/auth` (`src/server/security.ts`).
- Límite de cuerpo de 16 KB en pedidos, cuenta y autenticación, y de 128 KB en el resto.
- El Worker no arranca si `BETTER_AUTH_URL` no es https (salvo localhost).

## Convenciones de interfaz

- La tienda usa un tema oscuro: fondo `#0d0d17`, paneles `#151524` con borde `#26263a` y radio de 12 px, un acento violeta `#8b7cf6` y botones de píldora en degradado lavanda a violeta.
- Los tokens están en `src/styles.css`: colores semánticos de shadcn más `foreground-secondary`, `brand` y `photo`; tipografía con `type-display`, `type-h1` a `type-h4`, `type-lead`, `type-body`, `type-small` y `type-meta`; utilidades `container-page`, `panel`, `bg-primary-gradient`, `tap-area` y `tap-target` (objetivos táctiles de 44 px).
- El panel tiene su propia paleta oscura, aplicada con las clases `admin-theme` y `dark` en `body` (`src/components/admin/admin-theme.css`).
- Los componentes de `src/components/ui/` los genera el CLI de shadcn. Biome rechaza elementos `button`, `input`, `select`, `textarea` y `label` sin envolver fuera de esa carpeta, y la tienda usa `StoreButton` y `StoreIconButton` en lugar de `ui/button`.
- Los componentes de la tienda (`src/components/store/ui/`) reciben props simples y no consultan datos; una sola tarjeta de producto sirve para todos los listados.
- El panel se organiza en rutas delgadas (`src/routes/admin/<módulo>/`) sobre carpetas de funcionalidades (`src/features/<módulo>/` con `queries.ts`, `mutations.ts` y `search.ts`). Las tablas usan TanStack Table en modo manual con el estado en la URL, y los formularios TanStack Form con zod, mostrando los errores del servidor en su campo.
- Los códigos de error de la API se traducen a mensajes en `src/lib/errors.ts`.

## Migraciones

- `drizzle/0000_baseline.sql` contiene todas las tablas, generadas por drizzle-kit desde `src/db/schema/` y `src/db/auth-schema.ts`.
- `drizzle/0001_integrity_triggers.sql` es una migración personalizada con todos los triggers, las vistas `customer_segments` y `order_followups` y un índice de expresión. Está escrita para el separador de sentencias de D1: `BEGIN`/`END` en mayúsculas, `iif()` en lugar de `CASE` y finales de línea LF.
- Flujo de cambio: editar el esquema, `bun run db:generate`, revisar el SQL generado y luego `bun run db:reset && bun run db:migrate && bun run db:seed && bun run media:seed`. Producción: `bun run db:migrate:remote`.
- Con datos que conservar, los cambios son solo aditivos: tablas, índices y triggers nuevos, y `ALTER TABLE ADD COLUMN` nullable o con valor constante por defecto. El SQL generado no debe reconstruir tablas (`__new_`), ni usar `DROP TABLE` o `PRAGMA foreign_keys`. Las reglas que pueden cambiar se escriben como triggers, no como `CHECK`.
- Después de cambiar las opciones de Better Auth: `bun run auth:generate` y luego `bun run db:generate`.
- D1 enlaza los números de JavaScript como REAL, y en un batch las columnas con el mismo nombre deben llevar alias (`.as()`).

## Pruebas

- `bun test` ejecuta las pruebas unitarias de las reglas de dominio (`src/server/domain/*.test.ts`) y de las utilidades de `src/lib`.
- `src/db/migrations.test.ts` aplica todas las migraciones a SQLite con llaves foráneas activas y falla si falta un trigger, si el SQL generado reconstruye o borra una tabla, o si un trigger deja de rechazar lo que debe. `src/db/store-rules.test.ts` prueba las reglas de la tienda contra la base.
- `src/server/auth.test.ts` recorre cada ruta del panel sin sesión (401), como cliente (403) y como atención al cliente (según `accessTo`), y falla si un prefijo montado no tiene área.
- `src/lib/auth.test.ts` prueba el registro y el inicio de sesión con la configuración real.
- `src/lib/errors.test.ts` falla si un código de error del servidor no tiene mensaje, y `audit.test.ts` si la API escribe un tipo de entidad de auditoría no listado.
- Antes de publicar: `bun run typecheck`, `bun run lint` y `bun test`.

## Datos de demostración

La carga (`bun run db:seed`) crea la configuración de la tienda (IVA 13 %, datos bancarios de ejemplo), 6 categorías, 6 marcas, 19 productos publicados (SKU `TEC-001` a `ACC-004`), 3 sets, 3 proveedores con una compra inicial recibida, 2 zonas de envío (metropolitana y nacional), 3 métodos de pago, 7 páginas legales y de ayuda, 2 colecciones, 2 diapositivas de portada, clientes ficticios, pedidos de demostración en todos los estados, reseñas aprobadas y pendientes, avisos de reposición y 3 cupones: `BIENVENIDA10` (10 %, primera compra), `SETUP15` (15 % desde US$80) y `VERANO20` (vencido). Los datos de demostración se fechan respecto al día en que se genera la carga. Cada inserción se omite si su clave ya existe.
