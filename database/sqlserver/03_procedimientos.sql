-- NAGOMI - PROCEDIMIENTOS ALMACENADOS
-- Script repetible: CREATE OR ALTER reemplaza cada procedimiento.
-- Patrón común: parámetros validados al inicio, una transacción y TRY/CATCH con ROLLBACK y THROW.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE NagomiDB;
GO

-- CLIENTES ----------------------------------------------------------------

CREATE OR ALTER PROCEDURE dbo.sp_RegistrarCliente
    @Nombre    NVARCHAR(120),
    @Correo    NVARCHAR(120),
    @Telefono  VARCHAR(20) = NULL,
    @IdCliente INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- El correo es la identidad del cliente: sin espacios y en minúsculas
    SET @Nombre   = LTRIM(RTRIM(@Nombre));
    SET @Correo   = LOWER(LTRIM(RTRIM(@Correo)));
    SET @Telefono = NULLIF(REPLACE(REPLACE(LTRIM(RTRIM(@Telefono)), ' ', ''), '-', ''), '');
    IF @Telefono LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
        SET @Telefono = '+503' + @Telefono;

    BEGIN TRY
        IF @Nombre IS NULL OR @Nombre = N''
            THROW 50200, N'El nombre es obligatorio.', 1;
        IF @Correo IS NULL OR @Correo NOT LIKE N'_%@_%._%' OR @Correo LIKE N'% %'
            THROW 50201, N'El correo no es válido.', 1;
        IF @Telefono IS NOT NULL AND @Telefono NOT LIKE '+503[267][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
            THROW 50202, N'El teléfono debe ser salvadoreño: +503 y ocho dígitos.', 1;

        BEGIN TRANSACTION;

        INSERT INTO dbo.Cliente (Nombre, Correo, Telefono)
        VALUES (@Nombre, @Correo, @Telefono);

        SET @IdCliente = SCOPE_IDENTITY();

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        -- 2627 y 2601: violación de UNIQUE. El duplicado lo detecta la base, no una consulta previa.
        IF ERROR_NUMBER() IN (2627, 2601)
            THROW 50203, N'Ya existe un cliente registrado con ese correo.', 1;
        THROW;
    END CATCH
END;
GO

-- CARRITO -----------------------------------------------------------------

-- Agrega un producto o un combo. Si ya está en el carrito suma la cantidad, sin superar las existencias.
CREATE OR ALTER PROCEDURE dbo.sp_AgregarAlCarrito
    @CarritoId  UNIQUEIDENTIFIER,
    @Cantidad   INT,
    @IdProducto INT = NULL,
    @IdCombo    INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Disponible INT, @Actual INT;

    BEGIN TRY
        IF @CarritoId IS NULL
            THROW 50210, N'Falta el identificador del carrito.', 1;
        IF (@IdProducto IS NULL AND @IdCombo IS NULL) OR (@IdProducto IS NOT NULL AND @IdCombo IS NOT NULL)
            THROW 50211, N'Indique un producto o un combo, no ambos.', 1;
        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50212, N'La cantidad debe ser un entero positivo.', 1;

        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK) WHERE CarritoId = @CarritoId)
            INSERT INTO dbo.Carrito (CarritoId) VALUES (@CarritoId);

        IF @IdProducto IS NOT NULL
        BEGIN
            SELECT @Disponible = Stock FROM dbo.Producto WHERE IdProducto = @IdProducto AND Activo = 1;
            IF @Disponible IS NULL
                THROW 50213, N'El producto no existe o no está a la venta.', 1;

            SELECT @Actual = Cantidad
            FROM dbo.CarritoDetalle WITH (UPDLOCK, HOLDLOCK)
            WHERE CarritoId = @CarritoId AND IdProducto = @IdProducto;

            IF COALESCE(@Actual, 0) + @Cantidad > @Disponible
                THROW 50214, N'La cantidad supera las existencias disponibles.', 1;

            IF @Actual IS NULL
                INSERT INTO dbo.CarritoDetalle (CarritoId, IdProducto, Cantidad)
                VALUES (@CarritoId, @IdProducto, @Cantidad);
            ELSE
                UPDATE dbo.CarritoDetalle
                SET Cantidad = Cantidad + @Cantidad
                WHERE CarritoId = @CarritoId AND IdProducto = @IdProducto;
        END
        ELSE
        BEGIN
            SELECT @Disponible = Disponibles
            FROM dbo.vw_ComboResumen
            WHERE IdCombo = @IdCombo AND Activo = 1 AND ComponentesActivos = 1;
            IF @Disponible IS NULL
                THROW 50215, N'El combo no existe o no está a la venta.', 1;

            SELECT @Actual = Cantidad
            FROM dbo.CarritoCombo WITH (UPDLOCK, HOLDLOCK)
            WHERE CarritoId = @CarritoId AND IdCombo = @IdCombo;

            IF COALESCE(@Actual, 0) + @Cantidad > @Disponible
                THROW 50214, N'La cantidad supera las existencias disponibles.', 1;

            IF @Actual IS NULL
                INSERT INTO dbo.CarritoCombo (CarritoId, IdCombo, Cantidad)
                VALUES (@CarritoId, @IdCombo, @Cantidad);
            ELSE
                UPDATE dbo.CarritoCombo
                SET Cantidad = Cantidad + @Cantidad
                WHERE CarritoId = @CarritoId AND IdCombo = @IdCombo;
        END

        UPDATE dbo.Carrito SET FechaActualizacion = SYSDATETIME() WHERE CarritoId = @CarritoId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Al iniciar sesión el carrito de invitado se une al del cliente: se suman cantidades y se limitan al stock
CREATE OR ALTER PROCEDURE dbo.sp_FusionarCarrito
    @CarritoInvitado UNIQUEIDENTIFIER,
    @IdCliente       INT,
    @CarritoId       UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Productos TABLE (IdProducto INT PRIMARY KEY, Cantidad INT NOT NULL);
    DECLARE @Combos TABLE (IdCombo INT PRIMARY KEY, Cantidad INT NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.Cliente WHERE IdCliente = @IdCliente AND Activo = 1)
            THROW 50220, N'El cliente no existe o está inactivo.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK)
                       WHERE CarritoId = @CarritoInvitado AND IdCliente IS NULL)
            THROW 50221, N'El carrito de invitado no existe o ya pertenece a un cliente.', 1;

        SET @CarritoId = (SELECT CarritoId FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK) WHERE IdCliente = @IdCliente);

        IF @CarritoId IS NULL
        BEGIN
            -- El cliente no tenía carrito: el de invitado pasa a ser suyo
            UPDATE dbo.Carrito
            SET IdCliente = @IdCliente, FechaActualizacion = SYSDATETIME()
            WHERE CarritoId = @CarritoInvitado;
            SET @CarritoId = @CarritoInvitado;
        END
        ELSE
        BEGIN
            INSERT INTO @Productos (IdProducto, Cantidad)
            SELECT IdProducto, SUM(Cantidad)
            FROM dbo.CarritoDetalle
            WHERE CarritoId IN (@CarritoInvitado, @CarritoId)
            GROUP BY IdProducto;

            INSERT INTO @Combos (IdCombo, Cantidad)
            SELECT IdCombo, SUM(Cantidad)
            FROM dbo.CarritoCombo
            WHERE CarritoId IN (@CarritoInvitado, @CarritoId)
            GROUP BY IdCombo;

            DELETE FROM dbo.CarritoDetalle WHERE CarritoId IN (@CarritoInvitado, @CarritoId);
            DELETE FROM dbo.CarritoCombo WHERE CarritoId IN (@CarritoInvitado, @CarritoId);

            INSERT INTO dbo.CarritoDetalle (CarritoId, IdProducto, Cantidad)
            SELECT @CarritoId, l.IdProducto, CASE WHEN l.Cantidad > p.Stock THEN p.Stock ELSE l.Cantidad END
            FROM @Productos l
            JOIN dbo.Producto p ON p.IdProducto = l.IdProducto
            WHERE p.Activo = 1 AND p.Stock > 0;

            INSERT INTO dbo.CarritoCombo (CarritoId, IdCombo, Cantidad)
            SELECT @CarritoId, l.IdCombo, CASE WHEN l.Cantidad > v.Disponibles THEN v.Disponibles ELSE l.Cantidad END
            FROM @Combos l
            JOIN dbo.vw_ComboResumen v ON v.IdCombo = l.IdCombo
            WHERE v.Activo = 1 AND v.ComponentesActivos = 1 AND v.Disponibles > 0;

            DELETE FROM dbo.Carrito WHERE CarritoId = @CarritoInvitado;
            UPDATE dbo.Carrito SET FechaActualizacion = SYSDATETIME() WHERE CarritoId = @CarritoId;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PEDIDOS -----------------------------------------------------------------

-- Del carrito al pedido en una sola transacción.
-- Política de stock: se descuenta al crear el pedido (Pendiente) y vuelve si se cancela.
CREATE OR ALTER PROCEDURE dbo.sp_CrearPedidoDesdeCarrito
    @CarritoId   UNIQUEIDENTIFIER,
    @IdCliente   INT,
    @IdDireccion INT,
    @MetodoPago  VARCHAR(15),
    @CodigoCupon VARCHAR(30) = NULL,
    @IdUsuario   INT = NULL,
    @IdPedido    INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TasaIva          DECIMAL(5,2)  = dbo.fn_Configuracion('IvaPorcentaje'),
            @EnvioGratisDesde DECIMAL(12,2) = dbo.fn_Configuracion('EnvioGratisDesde'),
            @Ahora            DATETIME2(0)  = SYSDATETIME(),
            @IdZonaEnvio      INT,
            @CostoZona        DECIMAL(10,2),
            @IdCupon          INT,
            @PorcentajeCupon  DECIMAL(5,2),
            @SoloPrimeraCompra BIT,
            @MontoMinimo      DECIMAL(10,2),
            @Subtotal         DECIMAL(12,2),
            @Descuento        DECIMAL(12,2) = 0,
            @Envio            DECIMAL(12,2),
            @Total            DECIMAL(12,2),
            @Iva              DECIMAL(12,2),
            @LineasCarrito    INT,
            @Filas            INT;

    DECLARE @Lineas TABLE (
        IdProducto     INT           NULL,
        IdCombo        INT           NULL,
        Cantidad       INT           NOT NULL,
        PrecioUnitario DECIMAL(10,2) NOT NULL,
        CostoUnitario  DECIMAL(10,2) NOT NULL);

    DECLARE @Requerido TABLE (IdProducto INT PRIMARY KEY, Unidades INT NOT NULL);

    SET @CodigoCupon = NULLIF(UPPER(LTRIM(RTRIM(@CodigoCupon))), '');

    BEGIN TRY
        IF @TasaIva IS NULL OR @EnvioGratisDesde IS NULL
            THROW 50300, N'Falta configurar IvaPorcentaje o EnvioGratisDesde.', 1;
        IF @MetodoPago IS NULL OR @MetodoPago NOT IN ('Tarjeta', 'Transferencia', 'ContraEntrega')
            THROW 50301, N'Método de pago no válido. Use Tarjeta, Transferencia o ContraEntrega.', 1;

        BEGIN TRANSACTION;

        -- 1. Verificar cliente, carrito y dirección
        IF NOT EXISTS (SELECT 1 FROM dbo.Cliente WHERE IdCliente = @IdCliente AND Activo = 1)
            THROW 50302, N'El cliente no existe o está inactivo.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.Carrito WITH (UPDLOCK, HOLDLOCK)
                       WHERE CarritoId = @CarritoId AND IdCliente = @IdCliente)
            THROW 50303, N'El carrito no existe o no pertenece al cliente.', 1;

        SELECT @IdZonaEnvio = z.IdZonaEnvio, @CostoZona = z.Costo
        FROM dbo.Direccion d
        JOIN dbo.Municipio m ON m.IdMunicipio = d.IdMunicipio
        JOIN dbo.ZonaEnvio z ON z.IdZonaEnvio = m.IdZonaEnvio
        WHERE d.IdDireccion = @IdDireccion AND d.IdCliente = @IdCliente AND d.Activo = 1 AND z.Activo = 1;

        IF @IdZonaEnvio IS NULL
            THROW 50304, N'La dirección no pertenece al cliente o su zona no tiene envío disponible.', 1;

        -- 2. Leer precios y costos de la base, nunca de lo que envía el navegador
        INSERT INTO @Lineas (IdProducto, IdCombo, Cantidad, PrecioUnitario, CostoUnitario)
        SELECT d.IdProducto, NULL, d.Cantidad, p.Precio, p.Costo
        FROM dbo.CarritoDetalle d
        JOIN dbo.Producto p ON p.IdProducto = d.IdProducto
        WHERE d.CarritoId = @CarritoId AND p.Activo = 1;

        INSERT INTO @Lineas (IdProducto, IdCombo, Cantidad, PrecioUnitario, CostoUnitario)
        SELECT NULL, cc.IdCombo, cc.Cantidad, v.Precio, v.SumaCostos
        FROM dbo.CarritoCombo cc
        JOIN dbo.vw_ComboResumen v ON v.IdCombo = cc.IdCombo
        WHERE cc.CarritoId = @CarritoId AND v.Activo = 1 AND v.ComponentesActivos = 1;

        SET @LineasCarrito = (SELECT COUNT(*) FROM dbo.CarritoDetalle WHERE CarritoId = @CarritoId)
                           + (SELECT COUNT(*) FROM dbo.CarritoCombo WHERE CarritoId = @CarritoId);

        IF @LineasCarrito = 0
            THROW 50305, N'El carrito está vacío.', 1;
        IF (SELECT COUNT(*) FROM @Lineas) <> @LineasCarrito
            THROW 50306, N'El carrito contiene artículos que ya no están a la venta.', 1;

        SET @Subtotal = (SELECT SUM(Cantidad * PrecioUnitario) FROM @Lineas);

        -- 3. Cupón: vigente, con usos disponibles, una sola vez por cliente, con su monto mínimo y, si aplica, solo en la primera compra
        IF @CodigoCupon IS NOT NULL
        BEGIN
            SELECT @IdCupon = IdCupon, @PorcentajeCupon = Porcentaje,
                   @SoloPrimeraCompra = SoloPrimeraCompra, @MontoMinimo = MontoMinimo
            FROM dbo.Cupon WITH (UPDLOCK, HOLDLOCK)
            WHERE Codigo = @CodigoCupon AND Activo = 1 AND @Ahora >= FechaInicio AND @Ahora < FechaFin;

            IF @IdCupon IS NULL
                THROW 50307, N'El cupón no existe o no está vigente.', 1;
            IF EXISTS (SELECT 1 FROM dbo.Pedido
                       WHERE IdCliente = @IdCliente AND IdCupon = @IdCupon AND Estado <> 'Cancelado')
                THROW 50308, N'El cliente ya usó este cupón.', 1;
            IF @SoloPrimeraCompra = 1
               AND EXISTS (SELECT 1 FROM dbo.Pedido WHERE IdCliente = @IdCliente AND Estado <> 'Cancelado')
                THROW 50311, N'Este cupón es solo para la primera compra.', 1;
            IF @Subtotal < @MontoMinimo
                THROW 50312, N'El subtotal no alcanza el monto mínimo del cupón.', 1;

            UPDATE dbo.Cupon
            SET Usos = Usos + 1
            WHERE IdCupon = @IdCupon AND (UsoMaximo IS NULL OR Usos < UsoMaximo);

            IF @@ROWCOUNT = 0
                THROW 50309, N'El cupón alcanzó su límite de usos.', 1;

            SET @Descuento = ROUND(@Subtotal * @PorcentajeCupon / 100, 2);
        END

        -- 4. Envío por zona; gratis cuando lo que se paga en artículos alcanza el mínimo configurado
        SET @Envio = CASE WHEN @Subtotal - @Descuento >= @EnvioGratisDesde THEN 0 ELSE @CostoZona END;
        SET @Total = @Subtotal - @Descuento + @Envio;
        -- IVA incluido en los precios: se informa la parte del total que corresponde al impuesto
        SET @Iva = ROUND(@Total * @TasaIva / (100 + @TasaIva), 2);

        -- 5. Unidades por producto, incluidas las que vienen dentro de combos
        INSERT INTO @Requerido (IdProducto, Unidades)
        SELECT x.IdProducto, SUM(x.Unidades)
        FROM (
            SELECT IdProducto, Cantidad AS Unidades
            FROM @Lineas
            WHERE IdProducto IS NOT NULL
            UNION ALL
            SELECT cd.IdProducto, l.Cantidad * cd.Cantidad
            FROM @Lineas l
            JOIN dbo.ComboDetalle cd ON cd.IdCombo = l.IdCombo
        ) x
        GROUP BY x.IdProducto;

        -- 6. Encabezado: nace Pendiente; el trigger valida contra entrega y registra el estado
        INSERT INTO dbo.Pedido (IdCliente, IdDireccion, IdZonaEnvio, IdCupon, MetodoPago,
                                Subtotal, Descuento, Envio, TasaIva, Iva, Total, IdUsuarioActualiza)
        VALUES (@IdCliente, @IdDireccion, @IdZonaEnvio, @IdCupon, @MetodoPago,
                @Subtotal, @Descuento, @Envio, @TasaIva, @Iva, @Total, @IdUsuario);

        SET @IdPedido = SCOPE_IDENTITY();

        -- 7. Descuento condicional: solo baja el stock si todavía alcanza
        UPDATE p
        SET p.Stock = p.Stock - r.Unidades
        FROM dbo.Producto p
        JOIN @Requerido r ON r.IdProducto = p.IdProducto
        WHERE p.Activo = 1 AND p.Stock >= r.Unidades;

        SET @Filas = @@ROWCOUNT;
        IF @Filas <> (SELECT COUNT(*) FROM @Requerido)
            THROW 50310, N'Stock insuficiente para uno o más artículos del carrito.', 1;

        -- 8. Detalle con el precio del momento y movimiento de inventario
        INSERT INTO dbo.PedidoDetalle (IdPedido, IdProducto, IdCombo, Cantidad, PrecioUnitario, CostoUnitario)
        SELECT @IdPedido, IdProducto, IdCombo, Cantidad, PrecioUnitario, CostoUnitario
        FROM @Lineas;

        INSERT INTO dbo.MovimientoInventario (IdProducto, Tipo, Cantidad, IdPedido, Nota)
        SELECT IdProducto, 'Venta', -Unidades, @IdPedido, N'Venta en línea'
        FROM @Requerido;

        -- 9. Vaciar el carrito
        DELETE FROM dbo.CarritoDetalle WHERE CarritoId = @CarritoId;
        DELETE FROM dbo.CarritoCombo WHERE CarritoId = @CarritoId;
        UPDATE dbo.Carrito SET FechaActualizacion = SYSDATETIME() WHERE CarritoId = @CarritoId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Registra el pago confirmado por la pasarela, el banco o el repartidor
CREATE OR ALTER PROCEDURE dbo.sp_RegistrarPago
    @IdPedido   INT,
    @Pasarela   VARCHAR(20),
    @Referencia VARCHAR(80) = NULL,
    @Monto      DECIMAL(12,2),
    @IdUsuario  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Estado VARCHAR(12), @MetodoPago VARCHAR(15), @Total DECIMAL(12,2);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @Estado = Estado, @MetodoPago = MetodoPago, @Total = Total
        FROM dbo.Pedido WITH (UPDLOCK, HOLDLOCK)
        WHERE IdPedido = @IdPedido;

        IF @Estado IS NULL
            THROW 50320, N'El pedido no existe.', 1;
        -- La pasarela debe corresponder al método de pago elegido
        IF @Pasarela IS NULL
           OR NOT ((@MetodoPago = 'Tarjeta' AND @Pasarela = 'Wompi')
             OR (@MetodoPago = 'Transferencia' AND @Pasarela = 'Transferencia')
             OR (@MetodoPago = 'ContraEntrega' AND @Pasarela = 'Efectivo'))
            THROW 50321, N'La pasarela no corresponde al método de pago del pedido.', 1;
        -- Prepago se cobra en Pendiente; contra entrega se cobra cuando el pedido va en camino
        IF (@MetodoPago <> 'ContraEntrega' AND @Estado <> 'Pendiente')
           OR (@MetodoPago = 'ContraEntrega' AND @Estado <> 'Enviado')
            THROW 50322, N'El pedido no está en un estado que admita registrar el pago.', 1;
        IF @Monto IS NULL OR @Monto <> @Total
            THROW 50323, N'El monto del pago debe ser igual al total del pedido.', 1;

        INSERT INTO dbo.Pago (IdPedido, Pasarela, ReferenciaPasarela, Monto, Estado)
        VALUES (@IdPedido, @Pasarela, @Referencia, @Monto, 'Aprobado');

        IF @MetodoPago <> 'ContraEntrega'
        BEGIN
            UPDATE dbo.Pedido
            SET Estado = 'Pagado', IdUsuarioActualiza = @IdUsuario, FechaActualizacion = SYSDATETIME()
            WHERE IdPedido = @IdPedido AND Estado = 'Pendiente';

            IF @@ROWCOUNT = 0
                THROW 50324, N'El pedido cambió de estado mientras se registraba el pago.', 1;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2627, 2601)
            THROW 50325, N'Esa referencia de pago ya fue registrada.', 1;
        THROW;
    END CATCH
END;
GO

-- Cambia el estado de un pedido. El trigger valida la transición y la deja en el historial.
-- Solo Atención al cliente y Administrador cambian estados; el cliente únicamente puede cancelar su propio pedido.
CREATE OR ALTER PROCEDURE dbo.sp_CambiarEstadoPedido
    @IdPedido    INT,
    @EstadoNuevo VARCHAR(12),
    @IdUsuario   INT,
    @GuiaEnvio   NVARCHAR(60) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @EstadoActual VARCHAR(12), @IdCliente INT, @Rol VARCHAR(20), @IdClienteUsuario INT;

    SET @GuiaEnvio = NULLIF(LTRIM(RTRIM(@GuiaEnvio)), N'');

    BEGIN TRY
        IF @EstadoNuevo IS NULL OR @EstadoNuevo NOT IN ('Pagado', 'Enviado', 'Entregado', 'Cancelado')
            THROW 50330, N'Estado no válido.', 1;
        IF @EstadoNuevo = 'Enviado' AND @GuiaEnvio IS NULL
            THROW 50331, N'Para marcar Enviado indique la guía o el repartidor.', 1;

        SELECT @Rol = r.Nombre, @IdClienteUsuario = u.IdCliente
        FROM dbo.Usuario u
        JOIN dbo.Rol r ON r.IdRol = u.IdRol
        WHERE u.IdUsuario = @IdUsuario AND u.Activo = 1;

        IF @Rol IS NULL
            THROW 50332, N'El usuario no existe o está inactivo.', 1;

        BEGIN TRANSACTION;

        SELECT @EstadoActual = Estado, @IdCliente = IdCliente
        FROM dbo.Pedido WITH (UPDLOCK, HOLDLOCK)
        WHERE IdPedido = @IdPedido;

        IF @EstadoActual IS NULL
            THROW 50333, N'El pedido no existe.', 1;
        IF @Rol = 'Cliente' AND (@EstadoNuevo <> 'Cancelado' OR @IdClienteUsuario IS NULL OR @IdClienteUsuario <> @IdCliente)
            THROW 50334, N'Un cliente solo puede cancelar sus propios pedidos.', 1;

        UPDATE dbo.Pedido
        SET Estado             = @EstadoNuevo,
            GuiaEnvio          = COALESCE(@GuiaEnvio, GuiaEnvio),
            IdUsuarioActualiza = @IdUsuario,
            FechaActualizacion = SYSDATETIME()
        WHERE IdPedido = @IdPedido AND Estado = @EstadoActual;

        IF @@ROWCOUNT = 0
            THROW 50335, N'El pedido cambió de estado mientras se procesaba la solicitud.', 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- CATÁLOGO ----------------------------------------------------------------

-- Cambio masivo por categoría: rango validado, historial primero y todo en una transacción.
-- Es una operación de una sola vez: ejecutarla dos veces aplica el porcentaje dos veces.
CREATE OR ALTER PROCEDURE dbo.sp_CambioMasivoPrecios
    @Categoria  NVARCHAR(80),
    @Porcentaje DECIMAL(5,2),
    @Filas      INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdCategoria INT;
    DECLARE @Motivo NVARCHAR(150) = CONCAT(N'Cambio masivo ', @Porcentaje, N' % en ', @Categoria);

    BEGIN TRY
        IF @Porcentaje IS NULL OR @Porcentaje NOT BETWEEN -50 AND 50 OR @Porcentaje = 0
            THROW 50400, N'El porcentaje debe estar entre -50 y 50 y ser distinto de cero.', 1;

        SELECT @IdCategoria = IdCategoria FROM dbo.Categoria WHERE Nombre = @Categoria OR Slug = @Categoria;
        IF @IdCategoria IS NULL
            THROW 50401, N'La categoría no existe.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Producto
                   WHERE IdCategoria = @IdCategoria AND Activo = 1
                     AND ROUND(Precio * (1 + @Porcentaje / 100), 2) < Costo)
            THROW 50402, N'El cambio dejaría productos por debajo de su costo. No se aplicó ningún precio.', 1;

        BEGIN TRANSACTION;

        INSERT INTO dbo.HistorialPrecio (IdProducto, PrecioAnterior, PrecioNuevo, Motivo, IdTransaccion)
        SELECT IdProducto, Precio, ROUND(Precio * (1 + @Porcentaje / 100), 2), @Motivo, CURRENT_TRANSACTION_ID()
        FROM dbo.Producto
        WHERE IdCategoria = @IdCategoria AND Activo = 1
          AND ROUND(Precio * (1 + @Porcentaje / 100), 2) <> Precio;

        UPDATE dbo.Producto
        SET Precio = ROUND(Precio * (1 + @Porcentaje / 100), 2)
        WHERE IdCategoria = @IdCategoria AND Activo = 1
          AND ROUND(Precio * (1 + @Porcentaje / 100), 2) <> Precio;

        SET @Filas = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Retiro de agotados: baja lógica, no DELETE
CREATE OR ALTER PROCEDURE dbo.sp_RetirarAgotados
    @Filas INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Producto
        SET Activo = 0
        WHERE Stock = 0 AND Activo = 1;

        SET @Filas = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Ejercicio de clase: llega una remesa. Verifica el SKU, suma unidades, reactiva y deja el movimiento.
CREATE OR ALTER PROCEDURE dbo.sp_ReponerStock
    @Sku      VARCHAR(7),
    @Cantidad INT,
    @Nota     NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IdProducto INT;

    SET @Sku = UPPER(LTRIM(RTRIM(@Sku)));

    BEGIN TRY
        IF @Cantidad IS NULL OR @Cantidad <= 0
            THROW 50410, N'La cantidad a reponer debe ser mayor que cero.', 1;

        BEGIN TRANSACTION;

        SELECT @IdProducto = IdProducto FROM dbo.Producto WITH (UPDLOCK, HOLDLOCK) WHERE Sku = @Sku;
        IF @IdProducto IS NULL
            THROW 50411, N'El SKU no existe.', 1;

        UPDATE dbo.Producto
        SET Stock = Stock + @Cantidad, Activo = 1
        WHERE IdProducto = @IdProducto;

        INSERT INTO dbo.MovimientoInventario (IdProducto, Tipo, Cantidad, Nota)
        VALUES (@IdProducto, 'Entrada', @Cantidad, COALESCE(@Nota, N'Reposición de proveedor'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
