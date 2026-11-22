-- NAGOMI - REGLAS DE NEGOCIO EN TRIGGERS
-- Script repetible: CREATE OR ALTER reemplaza cada trigger sin duplicarlo.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE NagomiDB;
GO

-- BAJA LÓGICA: productos, clientes y pedidos no se borran -------------------

CREATE OR ALTER TRIGGER dbo.tr_Producto_BloquearDelete
ON dbo.Producto
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50100, N'Los productos no se eliminan porque los pedidos anteriores los necesitan. Use Activo = 0.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.tr_Cliente_BloquearDelete
ON dbo.Cliente
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50101, N'Los clientes no se eliminan porque sus pedidos siguen necesitando el registro. Use Activo = 0.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.tr_Pedido_BloquearDelete
ON dbo.Pedido
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50102, N'Los pedidos no se eliminan. Un pedido que no procede se cambia a Cancelado.', 1;
END;
GO

-- BITÁCORAS INMUTABLES: lo registrado no se edita ni se borra --------------

CREATE OR ALTER TRIGGER dbo.tr_HistorialPrecio_Inmutable
ON dbo.HistorialPrecio
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50103, N'El historial de precios no se modifica ni se elimina.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.tr_HistorialEstadoPedido_Inmutable
ON dbo.HistorialEstadoPedido
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50104, N'El historial de estados de pedido no se modifica ni se elimina.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.tr_MovimientoInventario_Inmutable
ON dbo.MovimientoInventario
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50105, N'Los movimientos de inventario no se modifican ni se eliminan. Registre un Ajuste.', 1;
END;
GO

-- PRECIOS -----------------------------------------------------------------

-- Todo cambio de precio queda en HistorialPrecio. Si un procedimiento ya lo registró
-- antes de actualizar (en la misma transacción), no se duplica.
CREATE OR ALTER TRIGGER dbo.tr_Producto_HistorialPrecio
ON dbo.Producto
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Precio)
        RETURN;

    INSERT INTO dbo.HistorialPrecio (IdProducto, PrecioAnterior, PrecioNuevo, Motivo, IdTransaccion)
    SELECT i.IdProducto, d.Precio, i.Precio, N'Cambio individual', CURRENT_TRANSACTION_ID()
    FROM inserted i
    JOIN deleted d ON d.IdProducto = i.IdProducto
    WHERE i.Precio <> d.Precio
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.HistorialPrecio h
          WHERE h.IdTransaccion = CURRENT_TRANSACTION_ID()
            AND h.IdProducto = i.IdProducto
            AND h.PrecioAnterior = d.Precio
            AND h.PrecioNuevo = i.Precio);
END;
GO

-- COMBOS ------------------------------------------------------------------

-- Un combo activo cuesta menos que la suma de sus artículos, no menos que su costo y tiene al menos dos artículos
CREATE OR ALTER TRIGGER dbo.tr_Combo_ValidarPrecio
ON dbo.Combo
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Combo VARCHAR(40);

    SELECT TOP (1) @Combo = v.Slug
    FROM dbo.vw_ComboResumen v
    JOIN inserted i ON i.IdCombo = v.IdCombo
    WHERE v.Activo = 1
      AND (v.Articulos < 2 OR v.Precio >= v.SumaPrecios OR v.Precio < v.SumaCostos);

    IF @Combo IS NOT NULL
    BEGIN
        DECLARE @Mensaje NVARCHAR(400) = CONCAT(N'El combo ', @Combo,
            N' no cumple la regla: debe tener al menos dos artículos y costar menos que la suma de sus precios sin bajar de su costo.');
        THROW 50110, @Mensaje, 1;
    END
END;
GO

CREATE OR ALTER TRIGGER dbo.tr_ComboDetalle_ValidarPrecio
ON dbo.ComboDetalle
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Combo VARCHAR(40);

    SELECT TOP (1) @Combo = v.Slug
    FROM dbo.vw_ComboResumen v
    WHERE v.Activo = 1
      AND v.IdCombo IN (SELECT IdCombo FROM inserted UNION SELECT IdCombo FROM deleted)
      AND (v.Articulos < 2 OR v.Precio >= v.SumaPrecios OR v.Precio < v.SumaCostos);

    IF @Combo IS NOT NULL
    BEGIN
        DECLARE @Mensaje NVARCHAR(400) = CONCAT(N'El combo ', @Combo,
            N' no cumple la regla: debe tener al menos dos artículos y costar menos que la suma de sus precios sin bajar de su costo.');
        THROW 50111, @Mensaje, 1;
    END
END;
GO

-- Bajar el precio de un artículo no puede dejar un combo más caro que sus partes
CREATE OR ALTER TRIGGER dbo.tr_Producto_ValidarCombos
ON dbo.Producto
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Precio) AND NOT UPDATE(Costo)
        RETURN;

    DECLARE @Combo VARCHAR(40);

    SELECT TOP (1) @Combo = v.Slug
    FROM dbo.vw_ComboResumen v
    WHERE v.Activo = 1
      AND v.IdCombo IN (SELECT cd.IdCombo FROM dbo.ComboDetalle cd JOIN inserted i ON i.IdProducto = cd.IdProducto)
      AND (v.Precio >= v.SumaPrecios OR v.Precio < v.SumaCostos);

    IF @Combo IS NOT NULL
    BEGIN
        DECLARE @Mensaje NVARCHAR(400) = CONCAT(N'El cambio deja al combo ', @Combo,
            N' fuera de la regla de precio. Ajuste o desactive el combo primero.');
        THROW 50112, @Mensaje, 1;
    END
END;
GO

-- PEDIDOS -----------------------------------------------------------------

-- Validaciones de un pedido nuevo: dirección del cliente, zona del municipio y contra entrega
CREATE OR ALTER TRIGGER dbo.tr_Pedido_ValidarNuevo
ON dbo.Pedido
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        LEFT JOIN dbo.Direccion d ON d.IdDireccion = i.IdDireccion AND d.IdCliente = i.IdCliente
        LEFT JOIN dbo.Municipio m ON m.IdMunicipio = d.IdMunicipio
        WHERE d.IdDireccion IS NULL OR m.IdZonaEnvio <> i.IdZonaEnvio)
        THROW 50120, N'La dirección no pertenece al cliente o la zona de envío no corresponde a su municipio.', 1;

    IF NOT EXISTS (SELECT 1 FROM inserted WHERE MetodoPago = 'ContraEntrega')
        RETURN;

    DECLARE @Limite DECIMAL(12,2) = dbo.fn_Configuracion('LimiteContraEntrega');
    IF @Limite IS NULL
        THROW 50121, N'Falta la configuración LimiteContraEntrega.', 1;

    -- Contra entrega solo en la zona metropolitana
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.ZonaEnvio z ON z.IdZonaEnvio = i.IdZonaEnvio
        WHERE i.MetodoPago = 'ContraEntrega' AND z.PermiteContraEntrega = 0)
        THROW 50122, N'El pago contra entrega solo está disponible en San Salvador y municipios cercanos.', 1;

    -- Contra entrega solo hasta el límite configurado
    IF EXISTS (SELECT 1 FROM inserted WHERE MetodoPago = 'ContraEntrega' AND Total > @Limite)
    BEGIN
        DECLARE @Mensaje NVARCHAR(300) = CONCAT(N'El pago contra entrega solo aplica a pedidos de hasta US$', @Limite, N'.');
        THROW 50123, @Mensaje, 1;
    END
END;
GO

-- Máquina de estados: solo transiciones permitidas, estados finales, pago previo y bitácora de cada cambio
CREATE OR ALTER TRIGGER dbo.tr_Pedido_Estado
ON dbo.Pedido
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    DECLARE @Mensaje NVARCHAR(300);

    IF NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        -- Todo pedido nace Pendiente
        IF EXISTS (SELECT 1 FROM inserted WHERE Estado <> 'Pendiente')
            THROW 50130, N'Un pedido nuevo siempre inicia en estado Pendiente.', 1;

        INSERT INTO dbo.HistorialEstadoPedido (IdPedido, EstadoAnterior, EstadoNuevo, IdUsuario)
        SELECT IdPedido, NULL, Estado, IdUsuarioActualiza
        FROM inserted;
        RETURN;
    END

    -- Entregado y Cancelado son estados finales
    IF EXISTS (SELECT 1 FROM deleted WHERE Estado IN ('Entregado', 'Cancelado'))
        THROW 50131, N'Un pedido Entregado o Cancelado ya no se modifica.', 1;

    -- Lo cobrado no cambia después de crear el pedido
    IF UPDATE(IdCliente) OR UPDATE(IdDireccion) OR UPDATE(IdZonaEnvio) OR UPDATE(IdCupon) OR UPDATE(MetodoPago)
       OR UPDATE(Subtotal) OR UPDATE(Descuento) OR UPDATE(Envio) OR UPDATE(TasaIva) OR UPDATE(Iva) OR UPDATE(Total)
        THROW 50132, N'El cliente, la dirección, el método de pago y los importes de un pedido no se modifican después de crearlo.', 1;

    SELECT TOP (1) @Mensaje = CONCAT(N'Transición no permitida en el pedido ', i.IdPedido, N': ', d.Estado, N' -> ', i.Estado,
                                     N' (método de pago ', i.MetodoPago, N').')
    FROM inserted i
    JOIN deleted d ON d.IdPedido = i.IdPedido
    WHERE i.Estado <> d.Estado
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.TransicionEstadoPedido t
          WHERE t.EstadoOrigen = d.Estado
            AND t.EstadoDestino = i.Estado
            AND (t.AplicaA = 'Todos'
                 OR (t.AplicaA = 'ContraEntrega' AND i.MetodoPago = 'ContraEntrega')
                 OR (t.AplicaA = 'Prepago' AND i.MetodoPago <> 'ContraEntrega')));

    IF @Mensaje IS NOT NULL
        THROW 50133, @Mensaje, 1;

    -- Pagado (o Entregado en contra entrega) exige un pago aprobado por el total
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.IdPedido = i.IdPedido
        WHERE i.Estado <> d.Estado
          AND (i.Estado = 'Pagado' OR (i.Estado = 'Entregado' AND i.MetodoPago = 'ContraEntrega'))
          AND COALESCE((SELECT SUM(pg.Monto) FROM dbo.Pago pg
                        WHERE pg.IdPedido = i.IdPedido AND pg.Estado = 'Aprobado'), 0) < i.Total)
        THROW 50134, N'El pedido no tiene un pago aprobado por el total.', 1;

    INSERT INTO dbo.HistorialEstadoPedido (IdPedido, EstadoAnterior, EstadoNuevo, IdUsuario)
    SELECT i.IdPedido, d.Estado, i.Estado, i.IdUsuarioActualiza
    FROM inserted i
    JOIN deleted d ON d.IdPedido = i.IdPedido
    WHERE i.Estado <> d.Estado;
END;
GO

-- Al cancelar: el stock vendido vuelve, se registra la devolución, se libera el cupón y el pago queda para reembolso
CREATE OR ALTER TRIGGER dbo.tr_Pedido_Cancelacion
ON dbo.Pedido
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Estado)
        RETURN;

    DECLARE @Cancelados TABLE (IdPedido INT PRIMARY KEY, IdCupon INT NULL);

    INSERT INTO @Cancelados (IdPedido, IdCupon)
    SELECT i.IdPedido, i.IdCupon
    FROM inserted i
    JOIN deleted d ON d.IdPedido = i.IdPedido
    WHERE i.Estado = 'Cancelado' AND d.Estado <> 'Cancelado';

    IF NOT EXISTS (SELECT 1 FROM @Cancelados)
        RETURN;

    UPDATE p
    SET p.Stock = p.Stock + r.Unidades
    FROM dbo.Producto p
    JOIN (
        SELECT m.IdProducto, -SUM(m.Cantidad) AS Unidades
        FROM dbo.MovimientoInventario m
        JOIN @Cancelados c ON c.IdPedido = m.IdPedido
        WHERE m.Tipo = 'Venta'
        GROUP BY m.IdProducto
    ) r ON r.IdProducto = p.IdProducto;

    INSERT INTO dbo.MovimientoInventario (IdProducto, Tipo, Cantidad, IdPedido, Nota)
    SELECT m.IdProducto, 'Devolucion', -SUM(m.Cantidad), m.IdPedido, N'Cancelación del pedido'
    FROM dbo.MovimientoInventario m
    JOIN @Cancelados c ON c.IdPedido = m.IdPedido
    WHERE m.Tipo = 'Venta'
    GROUP BY m.IdProducto, m.IdPedido;

    UPDATE cu
    SET cu.Usos = cu.Usos - x.Veces
    FROM dbo.Cupon cu
    JOIN (
        SELECT IdCupon, COUNT(*) AS Veces
        FROM @Cancelados
        WHERE IdCupon IS NOT NULL
        GROUP BY IdCupon
    ) x ON x.IdCupon = cu.IdCupon;

    UPDATE pg
    SET pg.Estado = 'Reembolsado'
    FROM dbo.Pago pg
    JOIN @Cancelados c ON c.IdPedido = pg.IdPedido
    WHERE pg.Estado = 'Aprobado';
END;
GO

-- La validación de estados corre antes que la cancelación
EXEC sp_settriggerorder @triggername = 'dbo.tr_Pedido_Estado', @order = 'First', @stmttype = 'UPDATE';
GO

-- RESEÑAS -----------------------------------------------------------------

-- Solo reseña quien recibió el producto (suelto o dentro de un combo) en un pedido entregado
CREATE OR ALTER TRIGGER dbo.tr_Resena_ValidarCompra
ON dbo.Resena
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted r
        WHERE NOT EXISTS (
            SELECT 1
            FROM dbo.Pedido pe
            JOIN dbo.PedidoDetalle pd ON pd.IdPedido = pe.IdPedido
            LEFT JOIN dbo.ComboDetalle cd ON cd.IdCombo = pd.IdCombo
            WHERE pe.IdCliente = r.IdCliente
              AND pe.Estado = 'Entregado'
              AND (pd.IdProducto = r.IdProducto OR cd.IdProducto = r.IdProducto)))
        THROW 50140, N'Solo puede reseñar un producto el cliente que lo recibió en un pedido entregado.', 1;
END;
GO
