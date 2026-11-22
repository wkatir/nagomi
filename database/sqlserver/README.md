# Base de datos de Nagomi (SQL Server)

Scripts T-SQL de la base `NagomiDB` de Nagomi, tienda en línea B2C de periféricos y accesorios de escritorio en El Salvador. Corresponden al punto 6 del proyecto: reglas de negocio traducidas en condiciones y restricciones de la base de datos.

La base es la última barrera. Cada regla se valida también en la interfaz y en el servidor, pero aquí se hace cumplir sin depender de ningún programa.

## Requisitos

- SQL Server 2017 o superior (se usan `CREATE OR ALTER`, `CURRENT_TRANSACTION_ID()` e índices filtrados).
- SQL Server Management Studio o Azure Data Studio, con `ANSI_NULLS` y `QUOTED_IDENTIFIER` activos (cada script los activa).

## Orden de ejecución

Ejecute los scripts en este orden, cada uno completo (contienen separadores `GO`):

| # | Script | Qué hace |
|---|---|---|
| 1 | `01_esquema.sql` | Crea `NagomiDB`, las 25 tablas (incluida la de transiciones de estado) con sus llaves, `CHECK`, `UNIQUE` e índices y sus transiciones permitidas, la función `fn_Configuracion` y la vista `vw_ComboResumen`. |
| 2 | `02_reglas_triggers.sql` | Crea los triggers: baja lógica, bitácoras inmutables, historial de precios, regla de precio de combos, validación de pedidos nuevos, máquina de estados, cancelación con devolución de stock y reseñas solo de compras entregadas. |
| 3 | `03_procedimientos.sql` | Crea los procedimientos de clientes, carrito, pedidos, pagos y catálogo. |
| 4 | `04_carga_inicial.sql` | Carga configuración, roles, categorías, marcas, los 19 productos, 3 combos, zonas y municipios, 6 clientes ficticios, cupones y 11 pedidos de demostración en distintos estados creados con los procedimientos, reseñas, lista de deseos y un carrito de invitado fusionado. |
| 5 | `05_consultas_reportes.sql` | Consultas de control y reportes (solo lectura). |

Todos los scripts son repetibles: si se ejecutan dos veces no duplican nada ni fallan porque algo ya existe. Las tablas se crean con `IF OBJECT_ID(...) IS NULL`, los índices con `IF NOT EXISTS (sys.indexes)`, los triggers, procedimientos, vista y función con `CREATE OR ALTER`, y los datos con `VALUES ... WHERE NOT EXISTS`. Los pedidos de demostración solo se crean si la tabla `Pedido` está vacía.

La excepción es `sp_CambioMasivoPrecios`: un cambio de precios es una operación de una sola vez. Ejecutarlo dos veces con 5 % sube el precio dos veces; cada ejecución queda en `HistorialPrecio`.

## Decisiones de diseño

- **IVA incluido.** Los precios del catálogo ya incluyen el 13 % de IVA. En cada pedido se cumple `Total = Subtotal - Descuento + Envio`, que es lo que paga el cliente, e `Iva = ROUND(Total * TasaIva / (100 + TasaIva), 2)` es la parte del total que corresponde al impuesto. Ambas reglas son `CHECK` de la tabla `Pedido`, y la tasa se copia en el pedido para que un cambio futuro del IVA no altere pedidos anteriores.
- **Envío gratis** cuando `Subtotal - Descuento` llega a `EnvioGratisDesde` (US$50.00), es decir, con lo que el cliente realmente paga en artículos.
- **Valores de negocio en configuración, no en código:** IVA, umbral de stock bajo, envío gratis, límite de contra entrega, días para cliente inactivo, compras para cliente frecuente y horas de seguimiento viven en `Configuracion`. El costo y el plazo de cada zona viven en `ZonaEnvio`.
- **La zona de envío sale del municipio** de la dirección (`Municipio.IdZonaEnvio`), no de lo que elija el cliente.
- **Stock:** se descuenta al crear el pedido (estado Pendiente) y vuelve al inventario si se cancela. Cada movimiento queda en `MovimientoInventario`, y la consulta 15 comprueba que el stock cuadre con la bitácora.
- **Contra entrega** se cobra al entregar: el pedido pasa de Pendiente a Enviado sin pasar por Pagado, y para marcarlo Entregado debe existir el pago en efectivo registrado.
- **Compra como invitado:** el carrito puede no tener cliente (`IdCliente` nulo). Para convertirlo en pedido, el invitado se registra con `sp_RegistrarCliente` (no necesita contraseña) y su carrito se le asigna con `sp_FusionarCarrito`.
- **Combos:** una línea de carrito o de pedido es un producto o un combo. El stock se descuenta por cada artículo del combo.
- **Roles** en `Rol` (Cliente, AtencionCliente, Administrador) y cuentas en `Usuario`. Solo se guarda el hash de la clave; los usuarios de demostración no tienen clave.

## Reglas de negocio y dónde se hacen cumplir

| Regla de negocio | Cómo se hace cumplir | Objeto |
|---|---|---|
| El SKU no se repite y tiene el formato `AAA-000` | `UNIQUE` y `CHECK` con `LIKE '[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]'` en intercalación binaria | `UQ_Producto_Sku`, `CK_Producto_Sku` |
| El precio es mayor que cero, el costo no es negativo, el dinero es decimal | `DECIMAL(10,2)` y `CHECK` | `CK_Producto_Precio`, `CK_Producto_Costo` |
| Ningún producto se vende por debajo de su costo | `CHECK (Precio >= Costo)` y validación previa en el cambio masivo | `CK_Producto_Margen`, `sp_CambioMasivoPrecios` |
| El stock nunca queda negativo | `CHECK (Stock >= 0)` y `UPDATE ... WHERE Stock >= @cantidad` con verificación de `@@ROWCOUNT` | `CK_Producto_Stock`, `sp_CrearPedidoDesdeCarrito` |
| Productos, clientes y pedidos no se borran (baja lógica) | Triggers `INSTEAD OF DELETE` que rechazan el borrado; columna `Activo` | `tr_Producto_BloquearDelete`, `tr_Cliente_BloquearDelete`, `tr_Pedido_BloquearDelete` |
| Todo cambio de precio queda registrado | Trigger que escribe `HistorialPrecio`; el cambio masivo registra el historial antes de actualizar y el trigger no lo duplica | `tr_Producto_HistorialPrecio`, `sp_CambioMasivoPrecios` |
| El cambio masivo va de -50 % a 50 % y es atómico | Validación del parámetro y una sola transacción | `sp_CambioMasivoPrecios` |
| Los productos agotados salen de la vista del cliente | `UPDATE ... SET Activo = 0 WHERE Stock = 0` | `sp_RetirarAgotados` |
| Una remesa repone stock y reactiva el producto | Verifica el SKU, suma unidades, reactiva y registra la entrada en una transacción | `sp_ReponerStock` |
| Historiales y bitácora de inventario no se alteran | Triggers `INSTEAD OF UPDATE, DELETE` | `tr_HistorialPrecio_Inmutable`, `tr_HistorialEstadoPedido_Inmutable`, `tr_MovimientoInventario_Inmutable` |
| Un combo cuesta menos que la suma de sus artículos, no menos que su costo, y tiene al menos dos artículos | Triggers sobre `Combo`, `ComboDetalle` y cambios de precio de `Producto` | `tr_Combo_ValidarPrecio`, `tr_ComboDetalle_ValidarPrecio`, `tr_Producto_ValidarCombos` |
| El correo del cliente es único y se guarda en minúsculas y sin espacios | `UNIQUE`, `CHECK` binario de minúsculas y normalización en el procedimiento; errores 2627/2601 convertidos en un mensaje claro | `UQ_Cliente_Correo`, `CK_Cliente_Correo`, `sp_RegistrarCliente` |
| El teléfono es salvadoreño: +503 y ocho dígitos | `CHECK` con `LIKE '+503[267]...'`; el procedimiento agrega +503 si llegan solo 8 dígitos | `CK_Cliente_Telefono`, `sp_RegistrarCliente` |
| Una cuenta de usuario por cliente; roles cerrados | Índice único filtrado y `CHECK` de la lista de roles | `UX_Usuario_IdCliente`, `CK_Rol_Nombre` |
| Una sola dirección principal por cliente | Índice único filtrado | `UX_Direccion_Principal` |
| Un carrito por cliente registrado; carrito de invitado con cliente nulo | Índice único filtrado sobre `IdCliente` | `UX_Carrito_IdCliente` |
| Una línea por producto en el carrito, cantidad positiva | Llave compuesta `(CarritoId, IdProducto)` y `CHECK (Cantidad > 0)` | `PK_CarritoDetalle`, `CK_CarritoDetalle_Cantidad` |
| Al agregar un producto repetido se suma la cantidad sin superar el stock | Validación dentro de una transacción | `sp_AgregarAlCarrito` |
| Al iniciar sesión el carrito de invitado se une al del cliente, sumando cantidades y limitándolas al stock | Fusión en una transacción | `sp_FusionarCarrito` |
| Los precios del pedido salen de la base, nunca del navegador | El procedimiento lee `Producto.Precio` y el precio del combo; `PedidoDetalle` copia precio y costo del momento | `sp_CrearPedidoDesdeCarrito` |
| La venta se registra completa o no se registra | Una transacción con `TRY/CATCH`, `ROLLBACK` y `THROW` | `sp_CrearPedidoDesdeCarrito` |
| El cupón tiene código único, de 1 % a 50 %, con vigencia válida y usos limitados | `UNIQUE` y `CHECK` sobre porcentaje, fechas y usos | `UQ_Cupon_Codigo`, `CK_Cupon_Porcentaje`, `CK_Cupon_Vigencia`, `CK_Cupon_Usos` |
| El cupón solo se aplica vigente, con usos disponibles y una vez por cliente | Validación y `UPDATE` condicional con `@@ROWCOUNT`; al cancelar se libera el uso | `sp_CrearPedidoDesdeCarrito`, `tr_Pedido_Cancelacion` |
| IVA incluido y totales consistentes | `CHECK (Total = Subtotal - Descuento + Envio)` y `CHECK (Iva = ROUND(Total * TasaIva / (100 + TasaIva), 2))` | `CK_Pedido_Total`, `CK_Pedido_Iva` |
| Envío por zona y gratis desde US$50 | Costo de `ZonaEnvio` y umbral de `Configuracion` | `sp_CrearPedidoDesdeCarrito` |
| La dirección del pedido es del cliente y la zona corresponde a su municipio | Trigger sobre pedidos nuevos | `tr_Pedido_ValidarNuevo` |
| Contra entrega solo en la zona metropolitana y hasta US$150 | Trigger que lee `ZonaEnvio.PermiteContraEntrega` y `LimiteContraEntrega` | `tr_Pedido_ValidarNuevo` |
| Estados y métodos de pago cerrados | `CHECK` de lista | `CK_Pedido_Estado`, `CK_Pedido_MetodoPago`, `CK_Pago_Pasarela` |
| Todo pedido nace Pendiente; solo transiciones permitidas; Entregado y Cancelado son finales | Trigger que valida contra `TransicionEstadoPedido` | `tr_Pedido_Estado`, `TransicionEstadoPedido` |
| Cancelado solo desde Pendiente o Pagado; el stock vuelve y queda registrado | Transiciones permitidas y trigger de cancelación que devuelve stock, registra la devolución y marca el pago para reembolso | `tr_Pedido_Estado`, `tr_Pedido_Cancelacion` |
| Pagado exige un pago aprobado por el total; contra entrega exige el cobro antes de Entregado | Trigger de estados y validaciones del registro de pago | `tr_Pedido_Estado`, `sp_RegistrarPago` |
| Una notificación de la pasarela no se registra dos veces | Índice único filtrado sobre la referencia | `UX_Pago_ReferenciaPasarela`, `sp_RegistrarPago` |
| Un pedido enviado lleva guía o repartidor | `CHECK` y validación del procedimiento | `CK_Pedido_Guia`, `sp_CambiarEstadoPedido` |
| Los importes, el cliente y el método de pago no cambian después de crear el pedido | Trigger que rechaza esas columnas en un `UPDATE` | `tr_Pedido_Estado` |
| Cada cambio de estado queda con fecha y usuario | El trigger escribe `HistorialEstadoPedido` con `IdUsuarioActualiza` | `tr_Pedido_Estado` |
| Solo atención al cliente o administración cambian estados; el cliente solo cancela sus propios pedidos | Validación de rol | `sp_CambiarEstadoPedido` |
| Calificación de 1 a 5 y una reseña por cliente y producto | `CHECK` y `UNIQUE` | `CK_Resena_Calificacion`, `UQ_Resena_Cliente_Producto` |
| Solo reseña quien recibió el producto en un pedido entregado (suelto o en combo) | Trigger | `tr_Resena_ValidarCompra` |
| Un producto una sola vez por lista de deseos | Llave compuesta | `PK_ListaDeseos` |
| Cada movimiento de inventario tiene el signo correcto y las ventas y devoluciones apuntan a un pedido | `CHECK` | `CK_MovimientoInventario_Signo`, `CK_MovimientoInventario_Pedido` |

## Procedimientos

| Procedimiento | Uso |
|---|---|
| `sp_RegistrarCliente` | Registra un cliente con correo normalizado; responde "Ya existe un cliente registrado con ese correo." ante un duplicado. |
| `sp_AgregarAlCarrito` | Agrega un producto o un combo al carrito; crea el carrito de invitado si no existe. |
| `sp_FusionarCarrito` | Une el carrito de invitado al del cliente al iniciar sesión. |
| `sp_CrearPedidoDesdeCarrito` | Convierte el carrito en pedido: valida, aplica cupón, calcula envío e IVA, descuenta stock y vacía el carrito. |
| `sp_RegistrarPago` | Registra el pago de la pasarela (Wompi), la transferencia o el efectivo del repartidor. |
| `sp_CambiarEstadoPedido` | Avanza o cancela un pedido; las reglas las aplica el trigger de estados. |
| `sp_CambioMasivoPrecios` | Sube o baja los precios de una categoría. |
| `sp_RetirarAgotados` | Desactiva los productos sin existencias. |
| `sp_ReponerStock` | Ejercicio de clase: repone unidades de un SKU y lo reactiva. |

Ejemplos:

```sql
-- Ejercicio de clase: llegaron 20 unidades del mouse vertical agotado
EXEC dbo.sp_ReponerStock @Sku = 'RAT-003', @Cantidad = 20, @Nota = N'Remesa del proveedor';

-- Subir 5 % los teclados (operación de una sola vez)
EXEC dbo.sp_CambioMasivoPrecios @Categoria = N'Teclados', @Porcentaje = 5.00;

-- Registrar un cliente (el correo se normaliza)
DECLARE @Id INT;
EXEC dbo.sp_RegistrarCliente @Nombre = N'María Pérez', @Correo = N'  Maria.Perez@Example.com ',
                             @Telefono = '7111-2222', @IdCliente = @Id OUTPUT;
```

## Pruebas rápidas de las reglas

Ejecute cada sentencia por separado. Todas deben fallar con un mensaje claro y ninguna cambia datos:

```sql
INSERT INTO dbo.Producto (Sku, Nombre, IdCategoria, IdMarca, Precio, Costo) VALUES ('tec-9', N'Prueba', 1, 1, 10, 5);  -- CK_Producto_Sku
UPDATE dbo.Producto SET Precio = 1 WHERE Sku = 'TEC-001';                     -- CK_Producto_Margen
DELETE FROM dbo.Producto WHERE Sku = 'TEC-001';                               -- baja lógica
UPDATE dbo.Combo SET Precio = 200 WHERE Slug = 'set-calma';                   -- regla de precio del combo
EXEC dbo.sp_CambioMasivoPrecios @Categoria = N'Teclados', @Porcentaje = 80;   -- fuera de rango
UPDATE dbo.Pedido SET Total = 1 WHERE IdPedido = 1;                           -- importes inmutables
```

Para probar la máquina de estados, intente cancelar con `sp_CambiarEstadoPedido` un pedido `Entregado`: el trigger responde que un pedido entregado ya no se modifica.

## Datos de demostración

Los clientes usan correos `@example.com` y teléfonos ficticios. Con la carga inicial los reportes muestran:

- Los cuatro segmentos: Ana López y José Hernández frecuentes, Carmen Rivas y Sofía Flores ocasionales, Luis Martínez inactivo (última compra hace 120 días) y Diego Castillo nuevo.
- Pedidos en los cinco estados, con pago con tarjeta, transferencia y contra entrega, dos cupones aplicados y una cancelación con su devolución de stock.
- Un pedido contra entrega Pendiente desde hace más de 48 horas para el reporte de seguimiento.
- RAT-003 retirado por agotado y productos con existencias bajas, entre ellos ALF-003, ACC-003 y TEC-003.

## Reportes de `05_consultas_reportes.sql`

1. Catálogo visible con disponibilidad y calificación.
2. Combos visibles con su ahorro.
3. Productos con existencias bajas (umbral de `Configuracion`).
4. Ventas por día con ticket promedio.
5. Ventas por mes con descuentos, envíos, IVA incluido y ticket promedio.
6. Ingreso y margen por producto o combo, con el precio del detalle y sin cancelados.
7. Unidades físicas vendidas y devueltas por producto, incluidas las de combos.
8. Inventario valorizado por categoría (ejercicio de clase).
9. Clientes con segmentación Nuevo, Ocasional, Frecuente o Inactivo (`LEFT JOIN`).
10. Pedidos por estado.
11. Horas promedio entre estados.
12. Seguimiento de pedidos Pendiente o Pagado con más de 48 horas sin avanzar.
13. Cupones vigentes.
14. Productos mejor calificados.
15. Control de inventario: productos cuyo stock no cuadra con la bitácora (debe salir vacío).
16. Historial de precios reciente.
