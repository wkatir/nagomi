# Nagomi — なごみ

Nagomi es una tienda en línea B2C de periféricos y accesorios para setups en El Salvador: teclados, mouse, alfombrillas, audífonos, iluminación y accesorios, además de sets (combos). Incluye la tienda para el cliente y un panel de administración para atender pedidos, controlar el inventario y analizar las ventas. Moneda, zona horaria, IVA, plazos, textos legales y demás datos del negocio se guardan en la base de datos, no en el código.

- Sitio publicado: <https://nagomi.contact-862.workers.dev>
- Informe final: [docs/informe/Informe_Final_Nagomi.pdf](docs/informe/Informe_Final_Nagomi.pdf)
- Documentación técnica: [docs/tecnico.md](docs/tecnico.md)

## Equipo

Proyecto de la asignatura Modelos de Comercio Electrónico, fase final, noviembre de 2026. Universidad Francisco Gavidia, Facultad de Ingeniería y Sistemas.

| Integrante | Carné |
|---|---|
| Atilio Gustavo Morataya Serrano | MS101122 |
| Wilmer Henrry Salazar Martínez | SM100223 |
| Josue Alberto Martínez Menjivar | MM100223 |
| Ariel Eduardo Hernández Rivera | HR100522 |

Docente: Carmen Celia Morales Samayoa.

## Funcionalidades

### Tienda

- Catálogo por categorías, marcas y colecciones, con fichas técnicas, fotos y productos relacionados.
- Búsqueda sin importar tildes ni mayúsculas, filtros por categoría, marca, precio y disponibilidad, y varios órdenes (destacados, novedades, precio, calificación, nombre).
- Sets o combos con precio menor que la suma de sus artículos y el ahorro visible.
- Reseñas de compradores verificados: solo reseña quien recibió el producto en un pedido entregado, y cada reseña pasa por moderación.
- Lista de deseos y avisos de reposición para productos agotados.
- Carrito persistente en el servidor, que se une al de la cuenta al iniciar sesión.
- Compra como invitado o con cuenta (perfil, direcciones guardadas, historial de pedidos).
- Checkout de una página con datos de El Salvador: teléfono `+503`, los 14 departamentos y 44 municipios, envío por zona y envío gratis desde un monto configurable.
- Pagos con tarjeta vía Wompi El Salvador, transferencia bancaria o contra entrega (limitado por zona y monto).
- Cupones de descuento (porcentaje o monto fijo, monto mínimo, vigencia, primera compra, límite por cliente).
- Seguimiento del pedido en `/pedido/<código>` con su historial de estados.
- Español (idioma base) e inglés (`/en`).

### Administración

- Roles administrador y atención al cliente, con permisos por área verificados en el servidor.
- Pedidos con estados (pendiente, pagado, enviado, entregado, cancelado), pagos, devoluciones, reembolsos y comprobante imprimible.
- Seguimiento por plazos: pedidos sin pago, pagados sin enviar y enviados sin entregar que pasaron su plazo.
- Clientes con segmentos (nuevo, ocasional, frecuente, inactivo), consentimientos y exportación CSV para campañas por correo o WhatsApp.
- Catálogo con SKU (`AAA-000`), variantes, fotos, marcas, categorías, sets, colecciones y diapositivas de la portada.
- Inventario por lotes con costo de llegada, bitácora de movimientos, ajustes y alertas de stock bajo.
- Compras y proveedores: órdenes de compra, recepciones y sugerencias de reposición.
- Reportes de ventas, productos, marcas, inventario, clientes, pedidos y entregas, y pérdidas, con exportación CSV.
- Bitácora de auditoría de cada cambio hecho desde el panel.

## Reglas de negocio en la base de datos

Las reglas de negocio se validan en la interfaz y en el servidor, pero la base de datos es la última barrera. Las migraciones de D1 las hacen cumplir con `CHECK` (formatos, rangos y listas cerradas), `UNIQUE` e índices únicos parciales, llaves foráneas y triggers. Los triggers están en [`drizzle/0001_integrity_triggers.sql`](drizzle/0001_integrity_triggers.sql): impiden que un lote quede con stock negativo, validan la máquina de estados del pedido, devuelven el stock al cancelar, registran el historial de precios y de estados, refuerzan la regla de precio de los sets, limitan las reseñas a compras entregadas y bloquean el borrado de registros del negocio (se archivan).

La carpeta [`database/sqlserver/`](database/sqlserver/) contiene la versión en SQL Server para la asignatura (esquema, triggers, procedimientos, carga inicial y reportes), con su propio [README](database/sqlserver/README.md).

## Tecnología

| Capa | Herramienta |
|---|---|
| Aplicación | TanStack Start (React 19, SSR) con TanStack Router, Query, Form y Table |
| API | Hono montado en `/api` |
| Datos | Drizzle ORM sobre Cloudflare D1 (SQLite) |
| Archivos | Cloudflare R2 (fotos e imágenes) |
| Ejecución | Cloudflare Workers |
| Autenticación | Better Auth |
| Idiomas | Paraglide JS |
| Interfaz | Tailwind CSS y shadcn/ui |
| Calidad | Biome (formato y lint), TypeScript, `bun test` |
| Herramientas | Bun |

## Desarrollo local

Requisitos: [Bun](https://bun.sh) 1.x y Node.js 22 o superior (Wrangler y Vite lo usan).

```bash
bun install
cp .dev.vars.example .dev.vars   # complete BETTER_AUTH_SECRET y BETTER_AUTH_URL=http://localhost:4600
bun run db:migrate               # aplica las migraciones a la D1 local
bun run db:seed                  # carga catálogo, configuración y datos de demostración
bun run media:seed               # sube las fotos al bucket R2 local
bun run admin:create -- --email admin@example.com --name "Nombre" --role admin
bun run dev                      # http://localhost:4600
```

- `BETTER_AUTH_SECRET` debe tener al menos 32 caracteres aleatorios (por ejemplo `bunx auth@latest secret` u `openssl rand -base64 32`).
- `WOMPI_CLIENT_ID` y `WOMPI_CLIENT_SECRET` son opcionales; sin ellos el pago con tarjeta aparece como no disponible. `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` también son opcionales (inicio de sesión con Google para el personal).
- `admin:create` acepta `--role admin|support` (por defecto `admin`). La contraseña se toma de `ADMIN_PASSWORD` o se genera y se muestra una sola vez.
- La tienda está en `/`, el panel en `/admin` y la cuenta del cliente en `/account`.
- `bun run db:reset` borra el estado local de D1 para empezar de cero. `db:seed` y `media:seed` se pueden ejecutar más de una vez.

Comprobaciones:

```bash
bun run typecheck   # genera tipos del Worker y mensajes de Paraglide, luego tsc
bun run lint
bun test
```

## Despliegue en Cloudflare

```bash
bunx wrangler login
bunx wrangler d1 create nagomi
# copie el database_id que imprime en d1_databases de wrangler.jsonc
bunx wrangler r2 bucket create nagomi-media

bunx wrangler secret put BETTER_AUTH_SECRET   # un valor nuevo, distinto del local
bunx wrangler secret put BETTER_AUTH_URL      # el origen https del sitio
# opcionales: WOMPI_CLIENT_ID, WOMPI_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

bun run db:migrate:remote
bun seed/build.ts && bunx wrangler d1 execute DB --remote --file=./seed/seed.sql
bun seed/media.ts --remote
bun run deploy
bun run admin:create -- --email admin@example.com --name "Nombre" --role admin --remote
```

- Si la sesión de Wrangler tiene acceso a varias cuentas de Cloudflare, defina la variable de entorno `CLOUDFLARE_ACCOUNT_ID` con la cuenta de destino antes de ejecutar los comandos.
- R2 debe estar habilitado en la cuenta antes de crear el bucket.
- El hash de contraseñas (scrypt) necesita más CPU que los 10 ms por solicitud del plan gratuito de Workers; el registro e inicio de sesión con contraseña requieren el plan Workers Paid.
- Con Wompi, configure en su panel el webhook `https://<dominio>/api/payments/wompi/webhook`. Con Google, la URI de redirección es `<BETTER_AUTH_URL>/api/auth/callback/google`.
- Después del primer despliegue, en `/admin/settings` reemplace los datos marcados como pendientes (razón social, NIT, dirección, correo de contacto, redes sociales) y revise la zona horaria, el país y los umbrales.

## Estructura del proyecto

```text
database/sqlserver/   versión SQL Server de la base para la asignatura
drizzle/              migraciones de D1 (tablas y triggers)
messages/             textos de la interfaz en es.json y en.json
public/               iconos, logo e imágenes para redes
scripts/              crear administradores, reiniciar la D1 local, recursos de marca
seed/                 catálogo, páginas, cupones, imágenes y datos de demostración
src/
  components/         componentes de la tienda, del panel y de shadcn/ui
  db/                 esquema de Drizzle y pruebas de las reglas de la base
  features/           pantallas del panel por módulo (pedidos, productos, reportes...)
  lib/                utilidades compartidas, esquemas zod, autenticación, enums
  routes/             rutas de TanStack Start: tienda (_store), panel (admin) y API
  server/             API Hono: rutas, reglas de dominio, autenticación y pagos Wompi
wrangler.jsonc        configuración del Worker, D1, R2 y límites de solicitudes
```

## Documentación técnica

La referencia técnica (API, carrito y checkout, política de stock, ciclo de vida del pedido, verificación del webhook de Wompi, roles y permisos, convenciones de interfaz, migraciones y pruebas) está en [docs/tecnico.md](docs/tecnico.md).
