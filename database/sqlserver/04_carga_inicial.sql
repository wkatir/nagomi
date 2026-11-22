-- NAGOMI - CARGA INICIAL
-- Script repetible: cada bloque inserta solo lo que todavía no existe.
-- Los pedidos de demostración se crean con los procedimientos y solo si la tabla Pedido está vacía.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE NagomiDB;
GO

-- CONFIGURACIÓN -------------------------------------------------------------

INSERT INTO dbo.Configuracion (Clave, Valor, Descripcion)
SELECT v.Clave, v.Valor, v.Descripcion
FROM (VALUES
    ('IvaPorcentaje',           13.00, N'IVA de El Salvador, incluido en los precios'),
    ('UmbralStockBajo',          5.00, N'Unidades a partir de las cuales un producto tiene existencias bajas'),
    ('EnvioGratisDesde',        50.00, N'Envío gratis cuando el monto en artículos llega a este valor (US$)'),
    ('LimiteContraEntrega',    150.00, N'Total máximo de un pedido pagado contra entrega (US$)'),
    ('DiasClienteInactivo',     90.00, N'Días sin comprar para considerar inactivo a un cliente'),
    ('ComprasClienteFrecuente',  3.00, N'Compras a partir de las cuales un cliente es frecuente'),
    ('HorasSeguimientoPedido',  48.00, N'Horas sin avanzar de estado para dar seguimiento a un pedido'))
AS v(Clave, Valor, Descripcion)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Configuracion c WHERE c.Clave = v.Clave);
GO

-- ROLES Y USUARIOS INTERNOS ---------------------------------------------------

INSERT INTO dbo.Rol (Nombre)
SELECT v.Nombre
FROM (VALUES ('Cliente'), ('AtencionCliente'), ('Administrador')) AS v(Nombre)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Rol r WHERE r.Nombre = v.Nombre);

-- Sin clave en el script: la aplicación asigna el hash al activar la cuenta
INSERT INTO dbo.Usuario (Correo, IdRol)
SELECT v.Correo, r.IdRol
FROM (VALUES
    (N'admin.nagomi@example.com',   'Administrador'),
    (N'soporte.nagomi@example.com', 'AtencionCliente'))
AS v(Correo, Rol)
JOIN dbo.Rol r ON r.Nombre = v.Rol
WHERE NOT EXISTS (SELECT 1 FROM dbo.Usuario u WHERE u.Correo = v.Correo);
GO

-- CATÁLOGO ----------------------------------------------------------------

INSERT INTO dbo.Categoria (Slug, Nombre, Subtitulo, Orden)
SELECT v.Slug, v.Nombre, v.Subtitulo, v.Orden
FROM (VALUES
    ('teclados',     N'Teclados',     N'Mecánicos y custom',    1),
    ('ratones',      N'Ratones',      N'Precisión y estilo',    2),
    ('alfombrillas', N'Alfombrillas', N'Comodidad y control',   3),
    ('audifonos',    N'Audífonos',    N'Inmersión total',       4),
    ('iluminacion',  N'Iluminación',  N'Dale vida a tu setup',  5),
    ('accesorios',   N'Accesorios',   N'Detalles que importan', 6))
AS v(Slug, Nombre, Subtitulo, Orden)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Categoria c WHERE c.Slug = v.Slug);

INSERT INTO dbo.Marca (Nombre, PaisOrigen)
SELECT v.Nombre, v.PaisOrigen
FROM (VALUES
    (N'Royal Kludge', 'CN'),
    (N'Pulsar',       'KR'),
    (N'Akko',         'CN'),
    (N'Nagomi',       'SV'),
    (N'Kumo Audio',   'CN'),
    (N'Luminex',      'CN'))
AS v(Nombre, PaisOrigen)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Marca m WHERE m.Nombre = v.Nombre);

INSERT INTO dbo.Producto (Sku, Nombre, Especificaciones, IdCategoria, IdMarca, Precio, Costo, Stock, Destacado, Insignia)
SELECT v.Sku, v.Nombre, v.Especificaciones, c.IdCategoria, m.IdMarca, v.Precio, v.Costo, v.Stock, v.Destacado, v.Insignia
FROM (VALUES
    ('TEC-001', N'Teclado Mecánico RK75',            N'75% · Switches Windy · RGB',          'teclados',     N'Royal Kludge', 89.99, 52.00, 14, 1, N'Más vendido'),
    ('TEC-002', N'Teclado Mecánico Sakura 65%',      N'65% · Hot-swap · Keycaps PBT',        'teclados',     N'Akko',         74.99, 43.00,  9, 0, NULL),
    ('TEC-003', N'Teclado Compacto Kuro 60%',        N'60% · Switches rojos · Inalámbrico',  'teclados',     N'Royal Kludge', 54.99, 31.00,  4, 0, NULL),
    ('TEC-004', N'Set de Keycaps Tsuki PBT',         N'132 teclas · Perfil Cherry · PBT',    'teclados',     N'Akko',         29.99, 15.50, 18, 0, NULL),
    ('RAT-001', N'Mouse Gaming Pulsar X2',           N'Ultraligero · 2.4G / Bluetooth',      'ratones',      N'Pulsar',       64.99, 38.00, 11, 1, NULL),
    ('RAT-002', N'Mouse Inalámbrico Hana',           N'Silencioso · 2.4G · 1600 DPI',        'ratones',      N'Nagomi',       24.99, 12.00, 22, 0, NULL),
    ('RAT-003', N'Mouse Ergonómico Vertical Tate',   N'Vertical · Bluetooth · Recargable',   'ratones',      N'Pulsar',       34.99, 18.50,  0, 0, NULL),
    ('ALF-001', N'Alfombrilla XL Sakura',            N'900x400mm · Antideslizante',          'alfombrillas', N'Nagomi',       24.99, 11.00, 20, 1, NULL),
    ('ALF-002', N'Alfombrilla Gran Ola',             N'800x300mm · Bordes cosidos',          'alfombrillas', N'Nagomi',       19.99,  9.00, 16, 0, NULL),
    ('ALF-003', N'Alfombrilla de Cuero Vegano Lila', N'800x400mm · Impermeable',             'alfombrillas', N'Nagomi',       22.99, 10.50,  3, 0, NULL),
    ('AUD-001', N'Audífonos Inalámbricos Yoru',      N'Over-ear · Bluetooth 5.3 · 40 h',     'audifonos',    N'Kumo Audio',   59.99, 34.00,  8, 0, NULL),
    ('AUD-002', N'Audífonos Gaming Kumo',            N'Micrófono · 7.1 virtual · USB',       'audifonos',    N'Kumo Audio',   44.99, 25.00, 12, 0, NULL),
    ('ILU-001', N'Barra de Luz RGB',                 N'Escritorio · 16 colores · USB',       'iluminacion',  N'Luminex',      34.99, 17.00, 15, 1, NULL),
    ('ILU-002', N'Lámpara de Monitor Hikari',        N'Sin reflejos · Control táctil',       'iluminacion',  N'Luminex',      39.99, 21.00,  6, 0, NULL),
    ('ILU-003', N'Tira LED RGB 5 m',                 N'App · Sincroniza con música',         'iluminacion',  N'Luminex',      17.99,  7.50, 30, 0, NULL),
    ('ACC-001', N'Soporte para Audífonos',           N'Aluminio · Antideslizante',           'accesorios',   N'Nagomi',       19.99,  8.50, 15, 1, NULL),
    ('ACC-002', N'Kit Organizador de Cables',        N'30 piezas · Adhesivo',                'accesorios',   N'Nagomi',       12.99,  5.00, 25, 0, NULL),
    ('ACC-003', N'Cable USB-C en Espiral Lila',      N'Conector aviador · 1.5 m',            'accesorios',   N'Nagomi',       21.99,  9.50,  2, 0, NULL),
    ('ACC-004', N'Reposamuñecas de Madera',          N'Nogal · Para teclado 75%',            'accesorios',   N'Nagomi',       18.99,  8.00, 10, 0, NULL))
AS v(Sku, Nombre, Especificaciones, Categoria, Marca, Precio, Costo, Stock, Destacado, Insignia)
JOIN dbo.Categoria c ON c.Slug = v.Categoria
JOIN dbo.Marca m ON m.Nombre = v.Marca
WHERE NOT EXISTS (SELECT 1 FROM dbo.Producto p WHERE p.Sku = v.Sku);

-- El inventario inicial entra a la bitácora para que Stock y movimientos cuadren
INSERT INTO dbo.MovimientoInventario (IdProducto, Tipo, Cantidad, Nota)
SELECT p.IdProducto, 'Entrada', p.Stock, N'Inventario inicial'
FROM dbo.Producto p
WHERE p.Stock > 0
  AND NOT EXISTS (SELECT 1 FROM dbo.MovimientoInventario m WHERE m.IdProducto = p.IdProducto);
GO

-- COMBOS: se crean inactivos, se les agregan artículos y luego se activan (el trigger valida el precio)
DECLARE @CombosNuevos TABLE (IdCombo INT PRIMARY KEY);

INSERT INTO dbo.Combo (Slug, Nombre, Precio, Activo)
OUTPUT inserted.IdCombo INTO @CombosNuevos
SELECT v.Slug, v.Nombre, v.Precio, 0
FROM (VALUES
    ('set-sakura', N'Set Sakura',        114.99),
    ('set-noche',  N'Set Noche Violeta', 159.99),
    ('set-calma',  N'Set Calma',          59.99))
AS v(Slug, Nombre, Precio)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Combo c WHERE c.Slug = v.Slug);

INSERT INTO dbo.ComboDetalle (IdCombo, IdProducto, Cantidad)
SELECT c.IdCombo, p.IdProducto, 1
FROM (VALUES
    ('set-sakura', 'TEC-002'), ('set-sakura', 'ALF-001'), ('set-sakura', 'RAT-002'),
    ('set-noche',  'TEC-001'), ('set-noche',  'RAT-001'), ('set-noche',  'ALF-002'),
    ('set-calma',  'ILU-001'), ('set-calma',  'ACC-001'), ('set-calma',  'ACC-002'))
AS v(Slug, Sku)
JOIN dbo.Combo c ON c.Slug = v.Slug
JOIN dbo.Producto p ON p.Sku = v.Sku
WHERE NOT EXISTS (SELECT 1 FROM dbo.ComboDetalle cd WHERE cd.IdCombo = c.IdCombo AND cd.IdProducto = p.IdProducto);

UPDATE c
SET c.Activo = 1
FROM dbo.Combo c
JOIN @CombosNuevos n ON n.IdCombo = c.IdCombo;
GO

-- ENVÍOS ------------------------------------------------------------------

INSERT INTO dbo.ZonaEnvio (Codigo, Nombre, Costo, PlazoEntrega, PermiteContraEntrega)
SELECT v.Codigo, v.Nombre, v.Costo, v.PlazoEntrega, v.PermiteContraEntrega
FROM (VALUES
    ('METRO', N'San Salvador y municipios cercanos', 3.50, N'24 a 48 horas',        1),
    ('RESTO', N'Resto del país',                     5.00, N'2 a 4 días hábiles',   0))
AS v(Codigo, Nombre, Costo, PlazoEntrega, PermiteContraEntrega)
WHERE NOT EXISTS (SELECT 1 FROM dbo.ZonaEnvio z WHERE z.Codigo = v.Codigo);

INSERT INTO dbo.Municipio (Departamento, Nombre, IdZonaEnvio)
SELECT v.Departamento, v.Nombre, z.IdZonaEnvio
FROM (VALUES
    (N'San Salvador', N'San Salvador Centro', 'METRO'),
    (N'San Salvador', N'San Salvador Este',   'METRO'),
    (N'San Salvador', N'San Salvador Oeste',  'METRO'),
    (N'San Salvador', N'San Salvador Sur',    'METRO'),
    (N'San Salvador', N'San Salvador Norte',  'RESTO'),
    (N'La Libertad',  N'La Libertad Sur',     'METRO'),
    (N'La Libertad',  N'La Libertad Este',    'METRO'),
    (N'La Libertad',  N'La Libertad Centro',  'RESTO'),
    (N'Santa Ana',    N'Santa Ana Centro',    'RESTO'),
    (N'San Miguel',   N'San Miguel Centro',   'RESTO'),
    (N'Sonsonate',    N'Sonsonate Centro',    'RESTO'),
    (N'Usulután',     N'Usulután Este',       'RESTO'))
AS v(Departamento, Nombre, Zona)
JOIN dbo.ZonaEnvio z ON z.Codigo = v.Zona
WHERE NOT EXISTS (SELECT 1 FROM dbo.Municipio m WHERE m.Departamento = v.Departamento AND m.Nombre = v.Nombre);
GO

-- CLIENTES DE DEMOSTRACIÓN (datos ficticios) -------------------------------

DECLARE @Clientes TABLE (
    Orden INT PRIMARY KEY, Nombre NVARCHAR(120), Correo NVARCHAR(120), Telefono VARCHAR(20),
    Departamento NVARCHAR(40), Municipio NVARCHAR(60), Colonia NVARCHAR(100), Calle NVARCHAR(150), PuntoReferencia NVARCHAR(200));

INSERT INTO @Clientes VALUES
    (1, N'Ana López',      N'ana.lopez@example.com',      '7012-3456', N'San Salvador', N'San Salvador Centro', N'Colonia Escalón',        N'Calle El Mirador, casa 12',     N'Frente al parque'),
    (2, N'Luis Martínez',  N'luis.martinez@example.com',  '7234-5678', N'Santa Ana',    N'Santa Ana Centro',    N'Colonia Santa Lucía',    N'Pasaje 3, casa 8',              N'Contiguo a la tienda La Esquina'),
    (3, N'Carmen Rivas',   N'carmen.rivas@example.com',   '6123-4567', N'La Libertad',  N'La Libertad Sur',     N'Residencial Utila',      N'Senda Los Pinos, casa 21',      NULL),
    (4, N'José Hernández', N'jose.hernandez@example.com', '7890-1234', N'San Salvador', N'San Salvador Este',   N'Colonia Los Santos',     N'Avenida Principal, casa 45',    N'Portón negro'),
    (5, N'Sofía Flores',   N'sofia.flores@example.com',   '7456-7890', N'San Miguel',   N'San Miguel Centro',   N'Colonia Ciudad Jardín',  N'Calle Las Flores, casa 7',      NULL),
    (6, N'Diego Castillo', N'diego.castillo@example.com', '6345-6789', N'La Libertad',  N'La Libertad Este',    N'Colonia La Cima',        N'Calle Los Almendros, casa 3',   N'Cerca del redondel');

DECLARE @Orden INT = 1, @Nombre NVARCHAR(120), @Correo NVARCHAR(120), @Telefono VARCHAR(20), @IdCliente INT;

WHILE @Orden <= (SELECT MAX(Orden) FROM @Clientes)
BEGIN
    SELECT @Nombre = Nombre, @Correo = Correo, @Telefono = Telefono FROM @Clientes WHERE Orden = @Orden;

    IF NOT EXISTS (SELECT 1 FROM dbo.Cliente WHERE Correo = @Correo)
        EXEC dbo.sp_RegistrarCliente @Nombre = @Nombre, @Correo = @Correo, @Telefono = @Telefono, @IdCliente = @IdCliente OUTPUT;

    SET @Orden = @Orden + 1;
END

INSERT INTO dbo.Direccion (IdCliente, IdMunicipio, Colonia, Calle, PuntoReferencia, Principal)
SELECT c.IdCliente, m.IdMunicipio, v.Colonia, v.Calle, v.PuntoReferencia, 1
FROM @Clientes v
JOIN dbo.Cliente c ON c.Correo = v.Correo
JOIN dbo.Municipio m ON m.Departamento = v.Departamento AND m.Nombre = v.Municipio
WHERE NOT EXISTS (SELECT 1 FROM dbo.Direccion d WHERE d.IdCliente = c.IdCliente);

INSERT INTO dbo.Usuario (Correo, IdRol, IdCliente)
SELECT c.Correo, r.IdRol, c.IdCliente
FROM @Clientes v
JOIN dbo.Cliente c ON c.Correo = v.Correo
JOIN dbo.Rol r ON r.Nombre = 'Cliente'
WHERE NOT EXISTS (SELECT 1 FROM dbo.Usuario u WHERE u.Correo = c.Correo);
GO

-- CUPONES (vigencia relativa a la fecha de carga) ---------------------------

DECLARE @Hoy DATE = CAST(SYSDATETIME() AS DATE);

INSERT INTO dbo.Cupon (Codigo, Descripcion, Porcentaje, FechaInicio, FechaFin, UsoMaximo)
SELECT v.Codigo, v.Descripcion, v.Porcentaje, DATEADD(DAY, v.DiaInicio, @Hoy), DATEADD(DAY, v.DiaFin, @Hoy), v.UsoMaximo
FROM (VALUES
    ('NAGOMI10',  N'Bienvenida: 10 % en tu compra',       10.00, -30, 365, NULL),
    ('SAKURA15',  N'Temporada Sakura: 15 %',              15.00,  -7,  60, 100),
    ('BUENFIN25', N'Promoción vencida de demostración',   25.00, -60, -30, 200),
    ('FUJI20',    N'Promoción futura de demostración',    20.00,  30,  60,  50))
AS v(Codigo, Descripcion, Porcentaje, DiaInicio, DiaFin, UsoMaximo)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Cupon c WHERE c.Codigo = v.Codigo);
GO

-- PEDIDOS DE DEMOSTRACIÓN ---------------------------------------------------
-- Se crean con los procedimientos (mismas reglas que la tienda) y después se ajustan
-- sus fechas al pasado para que los reportes por día, mes, segmento y seguimiento tengan datos.

IF NOT EXISTS (SELECT 1 FROM dbo.Pedido)
BEGIN
    DECLARE @Demo TABLE (
        Num INT PRIMARY KEY, Correo NVARCHAR(120), MetodoPago VARCHAR(15), Cupon VARCHAR(30),
        DiasAtras INT, EstadoFinal VARCHAR(12));

    INSERT INTO @Demo VALUES
        ( 1, N'luis.martinez@example.com',  'Transferencia', NULL,       120, 'Entregado'),
        ( 2, N'ana.lopez@example.com',      'Tarjeta',       NULL,        75, 'Entregado'),
        ( 3, N'ana.lopez@example.com',      'Transferencia', NULL,        40, 'Entregado'),
        ( 4, N'carmen.rivas@example.com',   'Tarjeta',       NULL,        30, 'Entregado'),
        ( 5, N'jose.hernandez@example.com', 'ContraEntrega', NULL,        20, 'Entregado'),
        ( 6, N'ana.lopez@example.com',      'Tarjeta',       NULL,        12, 'Entregado'),
        ( 7, N'carmen.rivas@example.com',   'Tarjeta',       NULL,         5, 'Cancelado'),
        ( 8, N'jose.hernandez@example.com', 'ContraEntrega', NULL,         3, 'Pendiente'),
        ( 9, N'jose.hernandez@example.com', 'ContraEntrega', NULL,         2, 'Enviado'),
        (10, N'sofia.flores@example.com',   'Transferencia', 'SAKURA15',   1, 'Pagado'),
        (11, N'ana.lopez@example.com',      'Tarjeta',       'NAGOMI10',   0, 'Pendiente');

    DECLARE @DemoLinea TABLE (Num INT, Sku VARCHAR(7) NULL, Combo VARCHAR(40) NULL, Cantidad INT);

    INSERT INTO @DemoLinea VALUES
        ( 1, 'RAT-002', NULL, 1), ( 1, 'ACC-002', NULL, 1),
        ( 2, 'TEC-001', NULL, 1), ( 2, 'ALF-001', NULL, 1),
        ( 3, NULL, 'set-calma', 1),
        ( 4, NULL, 'set-sakura', 1),
        ( 5, 'AUD-002', NULL, 1),
        ( 6, 'AUD-001', NULL, 1),
        ( 7, 'RAT-001', NULL, 1),
        ( 8, 'ILU-002', NULL, 1),
        ( 9, 'ACC-001', NULL, 1), ( 9, 'ACC-004', NULL, 1),
        (10, 'TEC-002', NULL, 1), (10, 'ALF-002', NULL, 1),
        (11, 'ILU-003', NULL, 2);

    DECLARE @IdAdmin INT = (SELECT IdUsuario FROM dbo.Usuario WHERE Correo = N'admin.nagomi@example.com'),
            @IdSoporte INT = (SELECT IdUsuario FROM dbo.Usuario WHERE Correo = N'soporte.nagomi@example.com'),
            @Num INT, @CorreoDemo NVARCHAR(120), @Metodo VARCHAR(15), @Cupon VARCHAR(30), @DiasAtras INT,
            @EstadoFinal VARCHAR(12), @IdClienteDemo INT, @IdDireccion INT, @IdUsuarioCliente INT,
            @CarritoId UNIQUEIDENTIFIER, @IdPedido INT, @Total DECIMAL(12,2), @Referencia VARCHAR(80),
            @Guia NVARCHAR(60), @Pasarela VARCHAR(20), @IdProducto INT, @IdCombo INT, @Cantidad INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE cur_Demo CURSOR LOCAL FAST_FORWARD FOR
            SELECT Num, Correo, MetodoPago, Cupon, DiasAtras, EstadoFinal FROM @Demo ORDER BY Num;
        OPEN cur_Demo;
        FETCH NEXT FROM cur_Demo INTO @Num, @CorreoDemo, @Metodo, @Cupon, @DiasAtras, @EstadoFinal;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @IdClienteDemo = c.IdCliente, @IdUsuarioCliente = u.IdUsuario
            FROM dbo.Cliente c
            JOIN dbo.Usuario u ON u.IdCliente = c.IdCliente
            WHERE c.Correo = @CorreoDemo;

            SELECT @IdDireccion = IdDireccion FROM dbo.Direccion WHERE IdCliente = @IdClienteDemo AND Principal = 1 AND Activo = 1;

            SET @CarritoId = (SELECT CarritoId FROM dbo.Carrito WHERE IdCliente = @IdClienteDemo);
            IF @CarritoId IS NULL
            BEGIN
                SET @CarritoId = NEWID();
                INSERT INTO dbo.Carrito (CarritoId, IdCliente) VALUES (@CarritoId, @IdClienteDemo);
            END

            DECLARE cur_Linea CURSOR LOCAL FAST_FORWARD FOR
                SELECT p.IdProducto, cb.IdCombo, l.Cantidad
                FROM @DemoLinea l
                LEFT JOIN dbo.Producto p ON p.Sku = l.Sku
                LEFT JOIN dbo.Combo cb ON cb.Slug = l.Combo
                WHERE l.Num = @Num;
            OPEN cur_Linea;
            FETCH NEXT FROM cur_Linea INTO @IdProducto, @IdCombo, @Cantidad;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                EXEC dbo.sp_AgregarAlCarrito @CarritoId = @CarritoId, @Cantidad = @Cantidad,
                                             @IdProducto = @IdProducto, @IdCombo = @IdCombo;
                FETCH NEXT FROM cur_Linea INTO @IdProducto, @IdCombo, @Cantidad;
            END
            CLOSE cur_Linea;
            DEALLOCATE cur_Linea;

            EXEC dbo.sp_CrearPedidoDesdeCarrito
                @CarritoId = @CarritoId, @IdCliente = @IdClienteDemo, @IdDireccion = @IdDireccion,
                @MetodoPago = @Metodo, @CodigoCupon = @Cupon, @IdUsuario = @IdUsuarioCliente,
                @IdPedido = @IdPedido OUTPUT;

            -- Fecha de demostración: el pedido todavía está Pendiente, así que puede ajustarse
            UPDATE dbo.Pedido
            SET Fecha = DATEADD(HOUR, -2, DATEADD(DAY, -@DiasAtras, SYSDATETIME()))
            WHERE IdPedido = @IdPedido;

            SELECT @Total = Total FROM dbo.Pedido WHERE IdPedido = @IdPedido;
            SET @Guia = CONCAT(N'NGM-', RIGHT(CONCAT('00000', @IdPedido), 5));

            IF @EstadoFinal IN ('Pagado', 'Enviado', 'Entregado') AND @Metodo <> 'ContraEntrega'
            BEGIN
                SET @Pasarela = CASE @Metodo WHEN 'Tarjeta' THEN 'Wompi' ELSE 'Transferencia' END;
                SET @Referencia = CONCAT(CASE @Metodo WHEN 'Tarjeta' THEN 'WMP-DEMO-' ELSE 'TRF-DEMO-' END, @IdPedido);
                EXEC dbo.sp_RegistrarPago @IdPedido = @IdPedido, @Pasarela = @Pasarela,
                                          @Referencia = @Referencia, @Monto = @Total, @IdUsuario = NULL;
            END

            IF @EstadoFinal IN ('Enviado', 'Entregado')
                EXEC dbo.sp_CambiarEstadoPedido @IdPedido = @IdPedido, @EstadoNuevo = 'Enviado',
                                                @IdUsuario = @IdSoporte, @GuiaEnvio = @Guia;

            IF @EstadoFinal = 'Entregado'
            BEGIN
                -- Contra entrega: el repartidor cobra en efectivo antes de cerrar el pedido
                IF @Metodo = 'ContraEntrega'
                BEGIN
                    SET @Pasarela = 'Efectivo';
                    EXEC dbo.sp_RegistrarPago @IdPedido = @IdPedido, @Pasarela = @Pasarela,
                                              @Referencia = NULL, @Monto = @Total, @IdUsuario = @IdSoporte;
                END
                EXEC dbo.sp_CambiarEstadoPedido @IdPedido = @IdPedido, @EstadoNuevo = 'Entregado', @IdUsuario = @IdSoporte;
            END

            -- El cliente cancela su propio pedido: el stock vuelve al inventario
            IF @EstadoFinal = 'Cancelado'
                EXEC dbo.sp_CambiarEstadoPedido @IdPedido = @IdPedido, @EstadoNuevo = 'Cancelado', @IdUsuario = @IdUsuarioCliente;

            FETCH NEXT FROM cur_Demo INTO @Num, @CorreoDemo, @Metodo, @Cupon, @DiasAtras, @EstadoFinal;
        END

        CLOSE cur_Demo;
        DEALLOCATE cur_Demo;

        -- Solo la carga de demostración reescribe fechas del historial, que fuera de aquí es inmutable
        DISABLE TRIGGER dbo.tr_HistorialEstadoPedido_Inmutable ON dbo.HistorialEstadoPedido;

        UPDATE h
        SET h.Fecha = DATEADD(HOUR,
                              CASE h.EstadoNuevo
                                  WHEN 'Pendiente' THEN 0
                                  WHEN 'Pagado'    THEN 1
                                  WHEN 'Cancelado' THEN 6
                                  WHEN 'Enviado'   THEN 20
                                  WHEN 'Entregado' THEN 46
                              END, p.Fecha)
        FROM dbo.HistorialEstadoPedido h
        JOIN dbo.Pedido p ON p.IdPedido = h.IdPedido;

        ENABLE TRIGGER dbo.tr_HistorialEstadoPedido_Inmutable ON dbo.HistorialEstadoPedido;

        UPDATE pg
        SET pg.Fecha = DATEADD(HOUR, CASE WHEN p.MetodoPago = 'ContraEntrega' THEN 46 ELSE 1 END, p.Fecha)
        FROM dbo.Pago pg
        JOIN dbo.Pedido p ON p.IdPedido = pg.IdPedido;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- RESEÑAS: solo de productos recibidos en pedidos entregados ----------------

INSERT INTO dbo.Resena (IdCliente, IdProducto, Calificacion, Comentario)
SELECT c.IdCliente, p.IdProducto, v.Calificacion, v.Comentario
FROM (VALUES
    (N'ana.lopez@example.com',      'TEC-001', 5, N'Los switches se sienten suaves y el RGB es precioso.'),
    (N'ana.lopez@example.com',      'ALF-001', 5, N'Enorme y no se mueve del escritorio.'),
    (N'ana.lopez@example.com',      'ILU-001', 5, N'Le dio otro ambiente a mi setup.'),
    (N'ana.lopez@example.com',      'ACC-001', 4, N'Firme y bonito, un poco pequeño para audífonos grandes.'),
    (N'ana.lopez@example.com',      'AUD-001', 4, N'Buena batería, el sonido es equilibrado.'),
    (N'luis.martinez@example.com',  'RAT-002', 4, N'Silencioso de verdad.'),
    (N'luis.martinez@example.com',  'ACC-002', 5, N'Por fin cables ordenados.'),
    (N'carmen.rivas@example.com',   'TEC-002', 5, N'Las teclas PBT son de muy buena calidad.'),
    (N'carmen.rivas@example.com',   'ALF-001', 5, N'El diseño Sakura es todavía más bonito en persona.'),
    (N'carmen.rivas@example.com',   'RAT-002', 4, N'Ligero y cómodo.'),
    (N'jose.hernandez@example.com', 'AUD-002', 4, N'Micrófono claro para jugar en línea.'))
AS v(Correo, Sku, Calificacion, Comentario)
JOIN dbo.Cliente c ON c.Correo = v.Correo
JOIN dbo.Producto p ON p.Sku = v.Sku
WHERE NOT EXISTS (SELECT 1 FROM dbo.Resena r WHERE r.IdCliente = c.IdCliente AND r.IdProducto = p.IdProducto)
  AND EXISTS (
      SELECT 1
      FROM dbo.Pedido pe
      JOIN dbo.PedidoDetalle pd ON pd.IdPedido = pe.IdPedido
      LEFT JOIN dbo.ComboDetalle cd ON cd.IdCombo = pd.IdCombo
      WHERE pe.IdCliente = c.IdCliente
        AND pe.Estado = 'Entregado'
        AND (pd.IdProducto = p.IdProducto OR cd.IdProducto = p.IdProducto));
GO

-- LISTA DE DESEOS -----------------------------------------------------------

INSERT INTO dbo.ListaDeseos (IdCliente, IdProducto)
SELECT c.IdCliente, p.IdProducto
FROM (VALUES
    (N'diego.castillo@example.com', 'TEC-001'),
    (N'diego.castillo@example.com', 'AUD-001'),
    (N'sofia.flores@example.com',   'ILU-002'))
AS v(Correo, Sku)
JOIN dbo.Cliente c ON c.Correo = v.Correo
JOIN dbo.Producto p ON p.Sku = v.Sku
WHERE NOT EXISTS (SELECT 1 FROM dbo.ListaDeseos l WHERE l.IdCliente = c.IdCliente AND l.IdProducto = p.IdProducto);
GO

-- CARRITO DE INVITADO QUE SE FUSIONA AL INICIAR SESIÓN -----------------------
-- Diego tenía RAT-002 x1 y ACC-003 x1; como invitado agregó RAT-002 x2 y ACC-003 x2.
-- Resultado: RAT-002 x3 y ACC-003 x2, porque solo hay 2 cables en existencia.

DECLARE @IdDiego INT = (SELECT IdCliente FROM dbo.Cliente WHERE Correo = N'diego.castillo@example.com'),
        @IdMouse INT = (SELECT IdProducto FROM dbo.Producto WHERE Sku = 'RAT-002'),
        @IdCable INT = (SELECT IdProducto FROM dbo.Producto WHERE Sku = 'ACC-003'),
        @CarritoCliente UNIQUEIDENTIFIER = NEWID(),
        @CarritoInvitado UNIQUEIDENTIFIER = NEWID(),
        @CarritoFinal UNIQUEIDENTIFIER;

IF @IdDiego IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Carrito WHERE IdCliente = @IdDiego)
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.Carrito (CarritoId, IdCliente) VALUES (@CarritoCliente, @IdDiego);
        EXEC dbo.sp_AgregarAlCarrito @CarritoId = @CarritoCliente, @Cantidad = 1, @IdProducto = @IdMouse;
        EXEC dbo.sp_AgregarAlCarrito @CarritoId = @CarritoCliente, @Cantidad = 1, @IdProducto = @IdCable;

        EXEC dbo.sp_AgregarAlCarrito @CarritoId = @CarritoInvitado, @Cantidad = 2, @IdProducto = @IdMouse;
        EXEC dbo.sp_AgregarAlCarrito @CarritoId = @CarritoInvitado, @Cantidad = 2, @IdProducto = @IdCable;

        EXEC dbo.sp_FusionarCarrito @CarritoInvitado = @CarritoInvitado, @IdCliente = @IdDiego, @CarritoId = @CarritoFinal OUTPUT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- RETIRO DE AGOTADOS: RAT-003 llega con 0 unidades y sale de la vista del cliente
EXEC dbo.sp_RetirarAgotados;
GO
