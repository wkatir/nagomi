-- NAGOMI - ESQUEMA DE LA BASE DE DATOS (SQL Server 2017 o superior)
-- Script repetible: solo crea lo que todavía no existe.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID('NagomiDB') IS NULL
    CREATE DATABASE NagomiDB;
GO

USE NagomiDB;
GO

-- CONFIGURACIÓN -------------------------------------------------------------

-- Las reglas numéricas (IVA, envío gratis, límites) viven aquí y no dentro del código
IF OBJECT_ID('dbo.Configuracion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Configuracion (
        Clave       VARCHAR(40)   NOT NULL CONSTRAINT PK_Configuracion PRIMARY KEY,
        Valor       DECIMAL(12,2) NOT NULL,
        Descripcion NVARCHAR(200) NOT NULL,
        CONSTRAINT CK_Configuracion_Valor CHECK (Valor >= 0),
        CONSTRAINT CK_Configuracion_Iva CHECK (Clave <> 'IvaPorcentaje' OR Valor BETWEEN 0 AND 30)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_Configuracion_Clave' AND definition LIKE '%HorasEnviadoSinEntregar%')
BEGIN
    DELETE FROM dbo.Configuracion WHERE Clave = 'HorasSeguimientoPedido';
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Configuracion_Clave')
    BEGIN
        ALTER TABLE dbo.Configuracion DROP CONSTRAINT CK_Configuracion_Clave;
    END
    ALTER TABLE dbo.Configuracion ADD CONSTRAINT CK_Configuracion_Clave CHECK (Clave IN (
        'IvaPorcentaje', 'UmbralStockBajo', 'EnvioGratisDesde', 'LimiteContraEntrega',
        'DiasClienteInactivo', 'ComprasClienteFrecuente',
        'HorasPendientePago', 'HorasPagadoSinEnviar', 'HorasEnviadoSinEntregar'));
END
GO

-- CATÁLOGO -----------------------------------------------------------------

IF OBJECT_ID('dbo.Categoria', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categoria (
        IdCategoria INT IDENTITY(1,1) CONSTRAINT PK_Categoria PRIMARY KEY,
        Slug        VARCHAR(40)   NOT NULL CONSTRAINT UQ_Categoria_Slug UNIQUE,
        Nombre      NVARCHAR(80)  NOT NULL CONSTRAINT UQ_Categoria_Nombre UNIQUE,
        Subtitulo   NVARCHAR(120) NULL,
        Orden       INT           NOT NULL CONSTRAINT DF_Categoria_Orden DEFAULT 0,
        Activo      BIT           NOT NULL CONSTRAINT DF_Categoria_Activo DEFAULT 1,
        CONSTRAINT CK_Categoria_Slug CHECK (Slug COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%')
    );
END
GO

IF OBJECT_ID('dbo.Marca', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Marca (
        IdMarca    INT IDENTITY(1,1) CONSTRAINT PK_Marca PRIMARY KEY,
        Nombre     NVARCHAR(80) NOT NULL CONSTRAINT UQ_Marca_Nombre UNIQUE,
        PaisOrigen CHAR(2)      NOT NULL,
        Activo     BIT          NOT NULL CONSTRAINT DF_Marca_Activo DEFAULT 1,
        CONSTRAINT CK_Marca_PaisOrigen CHECK (PaisOrigen COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z]')
    );
END
GO

IF OBJECT_ID('dbo.Producto', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Producto (
        IdProducto       INT IDENTITY(1,1) CONSTRAINT PK_Producto PRIMARY KEY,
        Sku              VARCHAR(7)    NOT NULL CONSTRAINT UQ_Producto_Sku UNIQUE,
        Nombre           NVARCHAR(120) NOT NULL,
        Especificaciones NVARCHAR(200) NULL,
        IdCategoria      INT           NOT NULL CONSTRAINT FK_Producto_Categoria REFERENCES dbo.Categoria(IdCategoria),
        IdMarca          INT           NOT NULL CONSTRAINT FK_Producto_Marca REFERENCES dbo.Marca(IdMarca),
        Precio           DECIMAL(10,2) NOT NULL,
        Costo            DECIMAL(10,2) NOT NULL,
        Stock            INT           NOT NULL CONSTRAINT DF_Producto_Stock DEFAULT 0,
        Destacado        BIT           NOT NULL CONSTRAINT DF_Producto_Destacado DEFAULT 0,
        Insignia         NVARCHAR(40)  NULL,
        Activo           BIT           NOT NULL CONSTRAINT DF_Producto_Activo DEFAULT 1,
        FechaCreacion    DATETIME2(0)  NOT NULL CONSTRAINT DF_Producto_FechaCreacion DEFAULT SYSDATETIME(),
        -- SKU: tres letras mayúsculas, guion y tres dígitos (TEC-001)
        CONSTRAINT CK_Producto_Sku CHECK (Sku COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]'),
        CONSTRAINT CK_Producto_Precio CHECK (Precio > 0),
        CONSTRAINT CK_Producto_Costo CHECK (Costo >= 0),
        -- Ningún producto se vende por debajo de su costo
        CONSTRAINT CK_Producto_Margen CHECK (Precio >= Costo),
        CONSTRAINT CK_Producto_Stock CHECK (Stock >= 0)
    );
END
GO

-- IdTransaccion permite saber si un cambio de precio ya quedó registrado en la misma transacción
IF OBJECT_ID('dbo.HistorialPrecio', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HistorialPrecio (
        IdHistorial    INT IDENTITY(1,1) CONSTRAINT PK_HistorialPrecio PRIMARY KEY,
        IdProducto     INT           NOT NULL CONSTRAINT FK_HistorialPrecio_Producto REFERENCES dbo.Producto(IdProducto),
        PrecioAnterior DECIMAL(10,2) NOT NULL,
        PrecioNuevo    DECIMAL(10,2) NOT NULL,
        Motivo         NVARCHAR(150) NULL,
        Usuario        NVARCHAR(128) NOT NULL CONSTRAINT DF_HistorialPrecio_Usuario DEFAULT SUSER_SNAME(),
        IdTransaccion  BIGINT        NOT NULL,
        Fecha          DATETIME2(3)  NOT NULL CONSTRAINT DF_HistorialPrecio_Fecha DEFAULT SYSDATETIME(),
        CONSTRAINT CK_HistorialPrecio_Precios CHECK (PrecioAnterior > 0 AND PrecioNuevo > 0 AND PrecioAnterior <> PrecioNuevo)
    );
END
GO

-- Un combo nace inactivo; se activa cuando ya tiene sus artículos y cumple la regla de precio
IF OBJECT_ID('dbo.Combo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Combo (
        IdCombo       INT IDENTITY(1,1) CONSTRAINT PK_Combo PRIMARY KEY,
        Slug          VARCHAR(40)   NOT NULL CONSTRAINT UQ_Combo_Slug UNIQUE,
        Nombre        NVARCHAR(120) NOT NULL,
        Precio        DECIMAL(10,2) NOT NULL,
        Activo        BIT           NOT NULL CONSTRAINT DF_Combo_Activo DEFAULT 0,
        FechaCreacion DATETIME2(0)  NOT NULL CONSTRAINT DF_Combo_FechaCreacion DEFAULT SYSDATETIME(),
        CONSTRAINT CK_Combo_Slug CHECK (Slug COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%'),
        CONSTRAINT CK_Combo_Precio CHECK (Precio > 0)
    );
END
GO

IF OBJECT_ID('dbo.ComboDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ComboDetalle (
        IdCombo    INT NOT NULL CONSTRAINT FK_ComboDetalle_Combo REFERENCES dbo.Combo(IdCombo),
        IdProducto INT NOT NULL CONSTRAINT FK_ComboDetalle_Producto REFERENCES dbo.Producto(IdProducto),
        Cantidad   INT NOT NULL CONSTRAINT DF_ComboDetalle_Cantidad DEFAULT 1,
        CONSTRAINT PK_ComboDetalle PRIMARY KEY (IdCombo, IdProducto),
        CONSTRAINT CK_ComboDetalle_Cantidad CHECK (Cantidad > 0)
    );
END
GO

-- ENVÍOS ------------------------------------------------------------------

-- El costo de envío por zona es configuración: se cambia aquí, no en el código
IF OBJECT_ID('dbo.ZonaEnvio', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ZonaEnvio (
        IdZonaEnvio          INT IDENTITY(1,1) CONSTRAINT PK_ZonaEnvio PRIMARY KEY,
        Codigo               VARCHAR(10)   NOT NULL CONSTRAINT UQ_ZonaEnvio_Codigo UNIQUE,
        Nombre               NVARCHAR(80)  NOT NULL,
        Costo                DECIMAL(10,2) NOT NULL,
        PlazoEntrega         NVARCHAR(60)  NOT NULL,
        PermiteContraEntrega BIT           NOT NULL CONSTRAINT DF_ZonaEnvio_PermiteContraEntrega DEFAULT 0,
        Activo               BIT           NOT NULL CONSTRAINT DF_ZonaEnvio_Activo DEFAULT 1,
        CONSTRAINT CK_ZonaEnvio_Costo CHECK (Costo >= 0)
    );
END
GO

-- La zona sale del municipio, no de lo que elija el cliente
IF OBJECT_ID('dbo.Municipio', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Municipio (
        IdMunicipio  INT IDENTITY(1,1) CONSTRAINT PK_Municipio PRIMARY KEY,
        Departamento NVARCHAR(40) NOT NULL,
        Nombre       NVARCHAR(60) NOT NULL,
        IdZonaEnvio  INT          NOT NULL CONSTRAINT FK_Municipio_ZonaEnvio REFERENCES dbo.ZonaEnvio(IdZonaEnvio),
        CONSTRAINT UQ_Municipio_Departamento_Nombre UNIQUE (Departamento, Nombre)
    );
END
GO

-- CLIENTES Y USUARIOS -----------------------------------------------------

IF OBJECT_ID('dbo.Cliente', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Cliente (
        IdCliente     INT IDENTITY(1,1) CONSTRAINT PK_Cliente PRIMARY KEY,
        Nombre        NVARCHAR(120) NOT NULL,
        Correo        NVARCHAR(120) NOT NULL CONSTRAINT UQ_Cliente_Correo UNIQUE,
        Telefono      VARCHAR(12)   NULL,
        Activo        BIT           NOT NULL CONSTRAINT DF_Cliente_Activo DEFAULT 1,
        FechaRegistro DATETIME2(0)  NOT NULL CONSTRAINT DF_Cliente_FechaRegistro DEFAULT SYSDATETIME(),
        -- El correo se guarda normalizado: minúsculas y sin espacios
        CONSTRAINT CK_Cliente_Correo CHECK (
            Correo = LOWER(Correo) COLLATE Latin1_General_BIN2
            AND Correo NOT LIKE N'% %'
            AND Correo LIKE N'_%@_%._%'),
        -- Teléfono salvadoreño: +503 y ocho dígitos (fijo 2, móvil 6 o 7)
        CONSTRAINT CK_Cliente_Telefono CHECK (Telefono LIKE '+503[267][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
    );
END
GO

IF OBJECT_ID('dbo.Rol', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Rol (
        IdRol  INT IDENTITY(1,1) CONSTRAINT PK_Rol PRIMARY KEY,
        Nombre VARCHAR(20) NOT NULL CONSTRAINT UQ_Rol_Nombre UNIQUE,
        CONSTRAINT CK_Rol_Nombre CHECK (Nombre IN ('Cliente', 'AtencionCliente', 'Administrador'))
    );
END
GO

-- Solo se guarda el hash de la clave, nunca la clave
IF OBJECT_ID('dbo.Usuario', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuario (
        IdUsuario     INT IDENTITY(1,1) CONSTRAINT PK_Usuario PRIMARY KEY,
        Correo        NVARCHAR(120) NOT NULL CONSTRAINT UQ_Usuario_Correo UNIQUE,
        ClaveHash     VARCHAR(255)  NULL,
        IdRol         INT           NOT NULL CONSTRAINT FK_Usuario_Rol REFERENCES dbo.Rol(IdRol),
        IdCliente     INT           NULL CONSTRAINT FK_Usuario_Cliente REFERENCES dbo.Cliente(IdCliente),
        Activo        BIT           NOT NULL CONSTRAINT DF_Usuario_Activo DEFAULT 1,
        FechaCreacion DATETIME2(0)  NOT NULL CONSTRAINT DF_Usuario_FechaCreacion DEFAULT SYSDATETIME(),
        CONSTRAINT CK_Usuario_Correo CHECK (
            Correo = LOWER(Correo) COLLATE Latin1_General_BIN2
            AND Correo NOT LIKE N'% %'
            AND Correo LIKE N'_%@_%._%')
    );
END
GO

IF OBJECT_ID('dbo.Direccion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Direccion (
        IdDireccion     INT IDENTITY(1,1) CONSTRAINT PK_Direccion PRIMARY KEY,
        IdCliente       INT           NOT NULL CONSTRAINT FK_Direccion_Cliente REFERENCES dbo.Cliente(IdCliente),
        IdMunicipio     INT           NOT NULL CONSTRAINT FK_Direccion_Municipio REFERENCES dbo.Municipio(IdMunicipio),
        Colonia         NVARCHAR(100) NOT NULL,
        Calle           NVARCHAR(150) NOT NULL,
        PuntoReferencia NVARCHAR(200) NULL,
        Principal       BIT           NOT NULL CONSTRAINT DF_Direccion_Principal DEFAULT 0,
        Activo          BIT           NOT NULL CONSTRAINT DF_Direccion_Activo DEFAULT 1
    );
END
GO

-- CARRITO -----------------------------------------------------------------

-- IdCliente nulo = carrito de invitado
IF OBJECT_ID('dbo.Carrito', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Carrito (
        CarritoId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Carrito PRIMARY KEY CONSTRAINT DF_Carrito_CarritoId DEFAULT NEWID(),
        IdCliente          INT              NULL CONSTRAINT FK_Carrito_Cliente REFERENCES dbo.Cliente(IdCliente),
        FechaCreacion      DATETIME2(0)     NOT NULL CONSTRAINT DF_Carrito_FechaCreacion DEFAULT SYSDATETIME(),
        FechaActualizacion DATETIME2(0)     NOT NULL CONSTRAINT DF_Carrito_FechaActualizacion DEFAULT SYSDATETIME()
    );
END
GO

-- Una línea por producto: la llave compuesta impide repetirlo; el precio no se copia
IF OBJECT_ID('dbo.CarritoDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarritoDetalle (
        CarritoId     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_CarritoDetalle_Carrito REFERENCES dbo.Carrito(CarritoId),
        IdProducto    INT              NOT NULL CONSTRAINT FK_CarritoDetalle_Producto REFERENCES dbo.Producto(IdProducto),
        Cantidad      INT              NOT NULL,
        FechaAgregado DATETIME2(0)     NOT NULL CONSTRAINT DF_CarritoDetalle_FechaAgregado DEFAULT SYSDATETIME(),
        CONSTRAINT PK_CarritoDetalle PRIMARY KEY (CarritoId, IdProducto),
        CONSTRAINT CK_CarritoDetalle_Cantidad CHECK (Cantidad > 0)
    );
END
GO

IF OBJECT_ID('dbo.CarritoCombo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CarritoCombo (
        CarritoId     UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_CarritoCombo_Carrito REFERENCES dbo.Carrito(CarritoId),
        IdCombo       INT              NOT NULL CONSTRAINT FK_CarritoCombo_Combo REFERENCES dbo.Combo(IdCombo),
        Cantidad      INT              NOT NULL,
        FechaAgregado DATETIME2(0)     NOT NULL CONSTRAINT DF_CarritoCombo_FechaAgregado DEFAULT SYSDATETIME(),
        CONSTRAINT PK_CarritoCombo PRIMARY KEY (CarritoId, IdCombo),
        CONSTRAINT CK_CarritoCombo_Cantidad CHECK (Cantidad > 0)
    );
END
GO

-- CUPONES -----------------------------------------------------------------

IF OBJECT_ID('dbo.Cupon', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Cupon (
        IdCupon     INT IDENTITY(1,1) CONSTRAINT PK_Cupon PRIMARY KEY,
        Codigo      VARCHAR(30)   NOT NULL CONSTRAINT UQ_Cupon_Codigo UNIQUE,
        Descripcion NVARCHAR(150) NULL,
        Porcentaje  DECIMAL(5,2)  NOT NULL,
        FechaInicio DATETIME2(0)  NOT NULL,
        FechaFin    DATETIME2(0)  NOT NULL,
        UsoMaximo   INT           NULL,
        Usos        INT           NOT NULL CONSTRAINT DF_Cupon_Usos DEFAULT 0,
        SoloPrimeraCompra BIT     NOT NULL CONSTRAINT DF_Cupon_SoloPrimeraCompra DEFAULT 0,
        MontoMinimo DECIMAL(10,2) NOT NULL CONSTRAINT DF_Cupon_MontoMinimo DEFAULT 0,
        Activo      BIT           NOT NULL CONSTRAINT DF_Cupon_Activo DEFAULT 1,
        -- Código en mayúsculas, solo letras y números
        CONSTRAINT CK_Cupon_Codigo CHECK (Codigo COLLATE Latin1_General_BIN2 NOT LIKE '%[^A-Z0-9]%'),
        -- El descuento va de 1 % a 50 %
        CONSTRAINT CK_Cupon_Porcentaje CHECK (Porcentaje BETWEEN 1 AND 50),
        CONSTRAINT CK_Cupon_Vigencia CHECK (FechaInicio < FechaFin),
        CONSTRAINT CK_Cupon_UsoMaximo CHECK (UsoMaximo IS NULL OR UsoMaximo > 0),
        -- Nunca se usa más veces de las permitidas
        CONSTRAINT CK_Cupon_Usos CHECK (Usos >= 0 AND (UsoMaximo IS NULL OR Usos <= UsoMaximo)),
        CONSTRAINT CK_Cupon_MontoMinimo CHECK (MontoMinimo >= 0)
    );
END
GO

IF COL_LENGTH('dbo.Cupon', 'SoloPrimeraCompra') IS NULL
BEGIN
    ALTER TABLE dbo.Cupon ADD SoloPrimeraCompra BIT NOT NULL CONSTRAINT DF_Cupon_SoloPrimeraCompra DEFAULT 0;
END
IF COL_LENGTH('dbo.Cupon', 'MontoMinimo') IS NULL
BEGIN
    ALTER TABLE dbo.Cupon ADD MontoMinimo DECIMAL(10,2) NOT NULL CONSTRAINT DF_Cupon_MontoMinimo DEFAULT 0
        CONSTRAINT CK_Cupon_MontoMinimo CHECK (MontoMinimo >= 0);
END
GO

-- PEDIDOS -----------------------------------------------------------------

-- Transiciones permitidas: Pendiente -> Pagado -> Enviado -> Entregado; Cancelado solo desde Pendiente o Pagado.
-- Contra entrega se cobra al entregar, por eso pasa de Pendiente a Enviado.
IF OBJECT_ID('dbo.TransicionEstadoPedido', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TransicionEstadoPedido (
        EstadoOrigen  VARCHAR(12) NOT NULL,
        EstadoDestino VARCHAR(12) NOT NULL,
        AplicaA       VARCHAR(15) NOT NULL,
        CONSTRAINT PK_TransicionEstadoPedido PRIMARY KEY (EstadoOrigen, EstadoDestino),
        CONSTRAINT CK_TransicionEstadoPedido_Origen CHECK (EstadoOrigen IN ('Pendiente', 'Pagado', 'Enviado')),
        CONSTRAINT CK_TransicionEstadoPedido_Destino CHECK (EstadoDestino IN ('Pagado', 'Enviado', 'Entregado', 'Cancelado')),
        CONSTRAINT CK_TransicionEstadoPedido_AplicaA CHECK (AplicaA IN ('Todos', 'Prepago', 'ContraEntrega'))
    );
END
GO

INSERT INTO dbo.TransicionEstadoPedido (EstadoOrigen, EstadoDestino, AplicaA)
SELECT v.EstadoOrigen, v.EstadoDestino, v.AplicaA
FROM (VALUES
    ('Pendiente', 'Pagado',    'Prepago'),
    ('Pendiente', 'Enviado',   'ContraEntrega'),
    ('Pagado',    'Enviado',   'Prepago'),
    ('Enviado',   'Entregado', 'Todos'),
    ('Pendiente', 'Cancelado', 'Todos'),
    ('Pagado',    'Cancelado', 'Todos'))
AS v(EstadoOrigen, EstadoDestino, AplicaA)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.TransicionEstadoPedido t
    WHERE t.EstadoOrigen = v.EstadoOrigen AND t.EstadoDestino = v.EstadoDestino);
GO

-- Precios con IVA incluido: Total = Subtotal - Descuento + Envio es lo que paga el cliente
-- e Iva es la parte del Total que corresponde al impuesto: ROUND(Total * Tasa / (100 + Tasa), 2)
IF OBJECT_ID('dbo.Pedido', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Pedido (
        IdPedido           INT IDENTITY(1,1) CONSTRAINT PK_Pedido PRIMARY KEY,
        IdCliente          INT           NOT NULL CONSTRAINT FK_Pedido_Cliente REFERENCES dbo.Cliente(IdCliente),
        IdDireccion        INT           NOT NULL CONSTRAINT FK_Pedido_Direccion REFERENCES dbo.Direccion(IdDireccion),
        IdZonaEnvio        INT           NOT NULL CONSTRAINT FK_Pedido_ZonaEnvio REFERENCES dbo.ZonaEnvio(IdZonaEnvio),
        IdCupon            INT           NULL CONSTRAINT FK_Pedido_Cupon REFERENCES dbo.Cupon(IdCupon),
        Fecha              DATETIME2(0)  NOT NULL CONSTRAINT DF_Pedido_Fecha DEFAULT SYSDATETIME(),
        Estado             VARCHAR(12)   NOT NULL CONSTRAINT DF_Pedido_Estado DEFAULT 'Pendiente',
        MetodoPago         VARCHAR(15)   NOT NULL,
        Subtotal           DECIMAL(12,2) NOT NULL,
        Descuento          DECIMAL(12,2) NOT NULL CONSTRAINT DF_Pedido_Descuento DEFAULT 0,
        Envio              DECIMAL(12,2) NOT NULL,
        TasaIva            DECIMAL(5,2)  NOT NULL,
        Iva                DECIMAL(12,2) NOT NULL,
        Total              DECIMAL(12,2) NOT NULL,
        GuiaEnvio          NVARCHAR(60)  NULL,
        IdUsuarioActualiza INT           NULL CONSTRAINT FK_Pedido_Usuario REFERENCES dbo.Usuario(IdUsuario),
        FechaActualizacion DATETIME2(0)  NOT NULL CONSTRAINT DF_Pedido_FechaActualizacion DEFAULT SYSDATETIME(),
        CONSTRAINT CK_Pedido_Estado CHECK (Estado IN ('Pendiente', 'Pagado', 'Enviado', 'Entregado', 'Cancelado')),
        CONSTRAINT CK_Pedido_MetodoPago CHECK (MetodoPago IN ('Tarjeta', 'Transferencia', 'ContraEntrega')),
        CONSTRAINT CK_Pedido_Subtotal CHECK (Subtotal > 0),
        CONSTRAINT CK_Pedido_Descuento CHECK (Descuento >= 0 AND Descuento <= Subtotal),
        CONSTRAINT CK_Pedido_Envio CHECK (Envio >= 0),
        CONSTRAINT CK_Pedido_TasaIva CHECK (TasaIva BETWEEN 0 AND 30),
        CONSTRAINT CK_Pedido_Total CHECK (Total = Subtotal - Descuento + Envio),
        CONSTRAINT CK_Pedido_Iva CHECK (Iva = ROUND(Total * TasaIva / (100 + TasaIva), 2)),
        -- Un pedido enviado lleva la guía o el nombre del repartidor
        CONSTRAINT CK_Pedido_Guia CHECK (Estado NOT IN ('Enviado', 'Entregado') OR GuiaEnvio IS NOT NULL)
    );
END
GO

-- Cada línea copia el precio y el costo del momento de la venta
IF OBJECT_ID('dbo.PedidoDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PedidoDetalle (
        IdPedidoDetalle INT IDENTITY(1,1) CONSTRAINT PK_PedidoDetalle PRIMARY KEY,
        IdPedido        INT           NOT NULL CONSTRAINT FK_PedidoDetalle_Pedido REFERENCES dbo.Pedido(IdPedido),
        IdProducto      INT           NULL CONSTRAINT FK_PedidoDetalle_Producto REFERENCES dbo.Producto(IdProducto),
        IdCombo         INT           NULL CONSTRAINT FK_PedidoDetalle_Combo REFERENCES dbo.Combo(IdCombo),
        Cantidad        INT           NOT NULL,
        PrecioUnitario  DECIMAL(10,2) NOT NULL,
        CostoUnitario   DECIMAL(10,2) NOT NULL,
        Importe AS (Cantidad * PrecioUnitario) PERSISTED,
        -- Cada línea es un producto o un combo, nunca ambos
        CONSTRAINT CK_PedidoDetalle_Articulo CHECK (
            (IdProducto IS NOT NULL AND IdCombo IS NULL) OR (IdProducto IS NULL AND IdCombo IS NOT NULL)),
        CONSTRAINT CK_PedidoDetalle_Cantidad CHECK (Cantidad > 0),
        CONSTRAINT CK_PedidoDetalle_Precio CHECK (PrecioUnitario > 0),
        CONSTRAINT CK_PedidoDetalle_Costo CHECK (CostoUnitario >= 0)
    );
END
GO

-- La referencia de la pasarela es única: la misma notificación no se registra dos veces
IF OBJECT_ID('dbo.Pago', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Pago (
        IdPago             INT IDENTITY(1,1) CONSTRAINT PK_Pago PRIMARY KEY,
        IdPedido           INT           NOT NULL CONSTRAINT FK_Pago_Pedido REFERENCES dbo.Pedido(IdPedido),
        Pasarela           VARCHAR(20)   NOT NULL,
        ReferenciaPasarela VARCHAR(80)   NULL,
        Monto              DECIMAL(12,2) NOT NULL,
        Estado             VARCHAR(12)   NOT NULL CONSTRAINT DF_Pago_Estado DEFAULT 'Aprobado',
        Fecha              DATETIME2(0)  NOT NULL CONSTRAINT DF_Pago_Fecha DEFAULT SYSDATETIME(),
        CONSTRAINT CK_Pago_Pasarela CHECK (Pasarela IN ('Wompi', 'Transferencia', 'Efectivo')),
        CONSTRAINT CK_Pago_Referencia CHECK (Pasarela = 'Efectivo' OR ReferenciaPasarela IS NOT NULL),
        CONSTRAINT CK_Pago_Monto CHECK (Monto > 0),
        CONSTRAINT CK_Pago_Estado CHECK (Estado IN ('Aprobado', 'Rechazado', 'Reembolsado'))
    );
END
GO

IF OBJECT_ID('dbo.HistorialEstadoPedido', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HistorialEstadoPedido (
        IdHistorialEstado INT IDENTITY(1,1) CONSTRAINT PK_HistorialEstadoPedido PRIMARY KEY,
        IdPedido          INT          NOT NULL CONSTRAINT FK_HistorialEstadoPedido_Pedido REFERENCES dbo.Pedido(IdPedido),
        EstadoAnterior    VARCHAR(12)  NULL,
        EstadoNuevo       VARCHAR(12)  NOT NULL,
        IdUsuario         INT          NULL CONSTRAINT FK_HistorialEstadoPedido_Usuario REFERENCES dbo.Usuario(IdUsuario),
        Fecha             DATETIME2(3) NOT NULL CONSTRAINT DF_HistorialEstadoPedido_Fecha DEFAULT SYSDATETIME()
    );
END
GO

-- POSVENTA ----------------------------------------------------------------

IF OBJECT_ID('dbo.Resena', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Resena (
        IdResena     INT IDENTITY(1,1) CONSTRAINT PK_Resena PRIMARY KEY,
        IdCliente    INT           NOT NULL CONSTRAINT FK_Resena_Cliente REFERENCES dbo.Cliente(IdCliente),
        IdProducto   INT           NOT NULL CONSTRAINT FK_Resena_Producto REFERENCES dbo.Producto(IdProducto),
        Calificacion TINYINT       NOT NULL,
        Comentario   NVARCHAR(500) NULL,
        Visible      BIT           NOT NULL CONSTRAINT DF_Resena_Visible DEFAULT 1,
        Fecha        DATETIME2(0)  NOT NULL CONSTRAINT DF_Resena_Fecha DEFAULT SYSDATETIME(),
        -- Una reseña por cliente y producto
        CONSTRAINT UQ_Resena_Cliente_Producto UNIQUE (IdCliente, IdProducto),
        CONSTRAINT CK_Resena_Calificacion CHECK (Calificacion BETWEEN 1 AND 5)
    );
END
GO

IF OBJECT_ID('dbo.ListaDeseos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ListaDeseos (
        IdCliente     INT          NOT NULL CONSTRAINT FK_ListaDeseos_Cliente REFERENCES dbo.Cliente(IdCliente),
        IdProducto    INT          NOT NULL CONSTRAINT FK_ListaDeseos_Producto REFERENCES dbo.Producto(IdProducto),
        FechaAgregado DATETIME2(0) NOT NULL CONSTRAINT DF_ListaDeseos_FechaAgregado DEFAULT SYSDATETIME(),
        CONSTRAINT PK_ListaDeseos PRIMARY KEY (IdCliente, IdProducto)
    );
END
GO

-- INVENTARIO --------------------------------------------------------------

-- Bitácora de inventario: la suma de movimientos de un producto debe ser igual a su Stock
IF OBJECT_ID('dbo.MovimientoInventario', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MovimientoInventario (
        IdMovimiento INT IDENTITY(1,1) CONSTRAINT PK_MovimientoInventario PRIMARY KEY,
        IdProducto   INT           NOT NULL CONSTRAINT FK_MovimientoInventario_Producto REFERENCES dbo.Producto(IdProducto),
        Tipo         VARCHAR(12)   NOT NULL,
        Cantidad     INT           NOT NULL,
        IdPedido     INT           NULL CONSTRAINT FK_MovimientoInventario_Pedido REFERENCES dbo.Pedido(IdPedido),
        Nota         NVARCHAR(200) NULL,
        Usuario      NVARCHAR(128) NOT NULL CONSTRAINT DF_MovimientoInventario_Usuario DEFAULT SUSER_SNAME(),
        Fecha        DATETIME2(3)  NOT NULL CONSTRAINT DF_MovimientoInventario_Fecha DEFAULT SYSDATETIME(),
        CONSTRAINT CK_MovimientoInventario_Tipo CHECK (Tipo IN ('Entrada', 'Venta', 'Devolucion', 'Ajuste')),
        -- Entradas y devoluciones suman, ventas restan, ajustes en cualquier sentido
        CONSTRAINT CK_MovimientoInventario_Signo CHECK (
            (Tipo IN ('Entrada', 'Devolucion') AND Cantidad > 0)
            OR (Tipo = 'Venta' AND Cantidad < 0)
            OR (Tipo = 'Ajuste' AND Cantidad <> 0)),
        -- Ventas y devoluciones siempre apuntan a un pedido
        CONSTRAINT CK_MovimientoInventario_Pedido CHECK (
            (Tipo IN ('Venta', 'Devolucion') AND IdPedido IS NOT NULL)
            OR (Tipo IN ('Entrada', 'Ajuste') AND IdPedido IS NULL))
    );
END
GO

-- ÍNDICES: llaves foráneas y columnas que filtran los reportes -----------

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Producto_IdCategoria' AND object_id = OBJECT_ID('dbo.Producto'))
    CREATE INDEX IX_Producto_IdCategoria ON dbo.Producto (IdCategoria) INCLUDE (Activo, Precio, Costo, Stock);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Producto_IdMarca' AND object_id = OBJECT_ID('dbo.Producto'))
    CREATE INDEX IX_Producto_IdMarca ON dbo.Producto (IdMarca);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Producto_Activo_Stock' AND object_id = OBJECT_ID('dbo.Producto'))
    CREATE INDEX IX_Producto_Activo_Stock ON dbo.Producto (Activo, Stock);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HistorialPrecio_IdProducto_Fecha' AND object_id = OBJECT_ID('dbo.HistorialPrecio'))
    CREATE INDEX IX_HistorialPrecio_IdProducto_Fecha ON dbo.HistorialPrecio (IdProducto, Fecha);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HistorialPrecio_IdTransaccion' AND object_id = OBJECT_ID('dbo.HistorialPrecio'))
    CREATE INDEX IX_HistorialPrecio_IdTransaccion ON dbo.HistorialPrecio (IdTransaccion, IdProducto);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ComboDetalle_IdProducto' AND object_id = OBJECT_ID('dbo.ComboDetalle'))
    CREATE INDEX IX_ComboDetalle_IdProducto ON dbo.ComboDetalle (IdProducto);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Municipio_IdZonaEnvio' AND object_id = OBJECT_ID('dbo.Municipio'))
    CREATE INDEX IX_Municipio_IdZonaEnvio ON dbo.Municipio (IdZonaEnvio);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Usuario_IdRol' AND object_id = OBJECT_ID('dbo.Usuario'))
    CREATE INDEX IX_Usuario_IdRol ON dbo.Usuario (IdRol);
-- Una cuenta de usuario por cliente
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Usuario_IdCliente' AND object_id = OBJECT_ID('dbo.Usuario'))
    CREATE UNIQUE INDEX UX_Usuario_IdCliente ON dbo.Usuario (IdCliente) WHERE IdCliente IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Direccion_IdCliente' AND object_id = OBJECT_ID('dbo.Direccion'))
    CREATE INDEX IX_Direccion_IdCliente ON dbo.Direccion (IdCliente);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Direccion_IdMunicipio' AND object_id = OBJECT_ID('dbo.Direccion'))
    CREATE INDEX IX_Direccion_IdMunicipio ON dbo.Direccion (IdMunicipio);
-- Una sola dirección principal activa por cliente
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Direccion_Principal' AND object_id = OBJECT_ID('dbo.Direccion'))
    CREATE UNIQUE INDEX UX_Direccion_Principal ON dbo.Direccion (IdCliente) WHERE Principal = 1 AND Activo = 1;
-- Un solo carrito por cliente registrado
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Carrito_IdCliente' AND object_id = OBJECT_ID('dbo.Carrito'))
    CREATE UNIQUE INDEX UX_Carrito_IdCliente ON dbo.Carrito (IdCliente) WHERE IdCliente IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CarritoDetalle_IdProducto' AND object_id = OBJECT_ID('dbo.CarritoDetalle'))
    CREATE INDEX IX_CarritoDetalle_IdProducto ON dbo.CarritoDetalle (IdProducto);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CarritoCombo_IdCombo' AND object_id = OBJECT_ID('dbo.CarritoCombo'))
    CREATE INDEX IX_CarritoCombo_IdCombo ON dbo.CarritoCombo (IdCombo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Cupon_Vigencia' AND object_id = OBJECT_ID('dbo.Cupon'))
    CREATE INDEX IX_Cupon_Vigencia ON dbo.Cupon (Activo, FechaInicio, FechaFin);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_IdCliente_Fecha' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_IdCliente_Fecha ON dbo.Pedido (IdCliente, Fecha) INCLUDE (Estado, Total);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_Estado_Fecha' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_Estado_Fecha ON dbo.Pedido (Estado, Fecha) INCLUDE (Total, Iva);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_Fecha' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_Fecha ON dbo.Pedido (Fecha) INCLUDE (Estado, Total, Iva);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_IdDireccion' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_IdDireccion ON dbo.Pedido (IdDireccion);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_IdZonaEnvio' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_IdZonaEnvio ON dbo.Pedido (IdZonaEnvio);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_IdCupon' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_IdCupon ON dbo.Pedido (IdCupon, IdCliente) WHERE IdCupon IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pedido_IdUsuarioActualiza' AND object_id = OBJECT_ID('dbo.Pedido'))
    CREATE INDEX IX_Pedido_IdUsuarioActualiza ON dbo.Pedido (IdUsuarioActualiza);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PedidoDetalle_IdPedido' AND object_id = OBJECT_ID('dbo.PedidoDetalle'))
    CREATE INDEX IX_PedidoDetalle_IdPedido ON dbo.PedidoDetalle (IdPedido);
-- Un producto o combo aparece una sola vez por pedido
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PedidoDetalle_Producto' AND object_id = OBJECT_ID('dbo.PedidoDetalle'))
    CREATE UNIQUE INDEX UX_PedidoDetalle_Producto ON dbo.PedidoDetalle (IdProducto, IdPedido) WHERE IdProducto IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_PedidoDetalle_Combo' AND object_id = OBJECT_ID('dbo.PedidoDetalle'))
    CREATE UNIQUE INDEX UX_PedidoDetalle_Combo ON dbo.PedidoDetalle (IdCombo, IdPedido) WHERE IdCombo IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Pago_IdPedido' AND object_id = OBJECT_ID('dbo.Pago'))
    CREATE INDEX IX_Pago_IdPedido ON dbo.Pago (IdPedido) INCLUDE (Estado, Monto);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Pago_ReferenciaPasarela' AND object_id = OBJECT_ID('dbo.Pago'))
    CREATE UNIQUE INDEX UX_Pago_ReferenciaPasarela ON dbo.Pago (ReferenciaPasarela) WHERE ReferenciaPasarela IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HistorialEstadoPedido_IdPedido_Fecha' AND object_id = OBJECT_ID('dbo.HistorialEstadoPedido'))
    CREATE INDEX IX_HistorialEstadoPedido_IdPedido_Fecha ON dbo.HistorialEstadoPedido (IdPedido, Fecha);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_HistorialEstadoPedido_IdUsuario' AND object_id = OBJECT_ID('dbo.HistorialEstadoPedido'))
    CREATE INDEX IX_HistorialEstadoPedido_IdUsuario ON dbo.HistorialEstadoPedido (IdUsuario);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Resena_IdProducto' AND object_id = OBJECT_ID('dbo.Resena'))
    CREATE INDEX IX_Resena_IdProducto ON dbo.Resena (IdProducto) INCLUDE (Calificacion, Visible);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ListaDeseos_IdProducto' AND object_id = OBJECT_ID('dbo.ListaDeseos'))
    CREATE INDEX IX_ListaDeseos_IdProducto ON dbo.ListaDeseos (IdProducto);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientoInventario_IdProducto_Fecha' AND object_id = OBJECT_ID('dbo.MovimientoInventario'))
    CREATE INDEX IX_MovimientoInventario_IdProducto_Fecha ON dbo.MovimientoInventario (IdProducto, Fecha) INCLUDE (Tipo, Cantidad);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovimientoInventario_IdPedido' AND object_id = OBJECT_ID('dbo.MovimientoInventario'))
    CREATE INDEX IX_MovimientoInventario_IdPedido ON dbo.MovimientoInventario (IdPedido) INCLUDE (Tipo, Cantidad) WHERE IdPedido IS NOT NULL;
GO

-- OBJETOS DE APOYO --------------------------------------------------------

CREATE OR ALTER FUNCTION dbo.fn_Configuracion (@Clave VARCHAR(40))
RETURNS DECIMAL(12,2)
AS
BEGIN
    RETURN (SELECT Valor FROM dbo.Configuracion WHERE Clave = @Clave);
END;
GO

-- Precio, costo y disponibilidad de cada combo calculados desde sus artículos
CREATE OR ALTER VIEW dbo.vw_ComboResumen
AS
SELECT c.IdCombo,
       c.Slug,
       c.Nombre,
       c.Precio,
       c.Activo,
       COUNT(cd.IdProducto)                                                    AS Articulos,
       COALESCE(SUM(cd.Cantidad * p.Precio), 0)                                AS SumaPrecios,
       COALESCE(SUM(cd.Cantidad * p.Costo), 0)                                 AS SumaCostos,
       COALESCE(MIN(CASE WHEN p.Activo = 1 THEN p.Stock / cd.Cantidad ELSE 0 END), 0) AS Disponibles,
       COALESCE(MIN(CAST(p.Activo AS INT)), 0)                                 AS ComponentesActivos
FROM dbo.Combo c
LEFT JOIN dbo.ComboDetalle cd ON cd.IdCombo = c.IdCombo
LEFT JOIN dbo.Producto p ON p.IdProducto = cd.IdProducto
GROUP BY c.IdCombo, c.Slug, c.Nombre, c.Precio, c.Activo;
GO
