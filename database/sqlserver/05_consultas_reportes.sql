-- NAGOMI - CONSULTAS DE CONTROL Y REPORTES
-- Solo lectura: se puede ejecutar las veces que sea necesario.
-- Los parámetros se declaran al inicio; los umbrales salen de Configuracion.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE NagomiDB;
GO

DECLARE @Desde            DATE         = DATEADD(DAY, -180, CAST(SYSDATETIME() AS DATE)),
        @Hasta            DATE         = CAST(SYSDATETIME() AS DATE),
        @UmbralStock      INT          = CAST(dbo.fn_Configuracion('UmbralStockBajo') AS INT),
        @DiasInactivo     INT          = CAST(dbo.fn_Configuracion('DiasClienteInactivo') AS INT),
        @ComprasFrecuente INT          = CAST(dbo.fn_Configuracion('ComprasClienteFrecuente') AS INT),
        @HorasSeguimiento INT          = CAST(dbo.fn_Configuracion('HorasSeguimientoPedido') AS INT),
        @MinResenas       INT          = 1,
        @Ahora            DATETIME2(0) = SYSDATETIME();

-- 1. Catálogo visible para el cliente (productos activos de categorías activas)
SELECT c.Nombre AS Categoria,
       p.Sku,
       p.Nombre,
       m.Nombre AS Marca,
       p.Especificaciones,
       p.Precio,
       p.Insignia,
       CASE WHEN p.Stock = 0 THEN N'Agotado'
            WHEN p.Stock <= @UmbralStock THEN N'Últimas unidades'
            ELSE N'Disponible' END AS Disponibilidad,
       r.Calificacion,
       COALESCE(r.Resenas, 0) AS Resenas
FROM dbo.Producto p
JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
JOIN dbo.Marca m ON m.IdMarca = p.IdMarca
OUTER APPLY (
    SELECT CAST(AVG(CAST(rs.Calificacion AS DECIMAL(3,1))) AS DECIMAL(2,1)) AS Calificacion,
           COUNT(*) AS Resenas
    FROM dbo.Resena rs
    WHERE rs.IdProducto = p.IdProducto AND rs.Visible = 1
) r
WHERE p.Activo = 1 AND c.Activo = 1
ORDER BY c.Orden, p.Destacado DESC, p.Nombre;

-- 2. Combos visibles con su ahorro frente a comprar los artículos por separado
SELECT v.Slug,
       v.Nombre,
       v.SumaPrecios AS PrecioPorSeparado,
       v.Precio      AS PrecioCombo,
       v.SumaPrecios - v.Precio AS Ahorro,
       v.Disponibles
FROM dbo.vw_ComboResumen v
WHERE v.Activo = 1 AND v.ComponentesActivos = 1
ORDER BY v.Precio;

-- 3. Productos con existencias bajas (umbral de Configuracion)
SELECT p.Sku, p.Nombre, c.Nombre AS Categoria, p.Stock, @UmbralStock AS Umbral
FROM dbo.Producto p
JOIN dbo.Categoria c ON c.IdCategoria = p.IdCategoria
WHERE p.Activo = 1 AND p.Stock <= @UmbralStock
ORDER BY p.Stock, p.Sku;

-- 4. Ventas por día con ticket promedio (los cancelados no cuentan)
SELECT CAST(pe.Fecha AS DATE)               AS Dia,
       COUNT(*)                             AS Pedidos,
       SUM(pe.Total)                        AS Ventas,
       SUM(pe.Iva)                          AS IvaIncluido,
       CAST(AVG(pe.Total) AS DECIMAL(12,2)) AS TicketPromedio
FROM dbo.Pedido pe
WHERE pe.Estado <> 'Cancelado'
  AND pe.Fecha >= @Desde AND pe.Fecha < DATEADD(DAY, 1, @Hasta)
GROUP BY CAST(pe.Fecha AS DATE)
ORDER BY Dia;

-- 5. Ventas por mes con ticket promedio
SELECT YEAR(pe.Fecha)                       AS Anio,
       MONTH(pe.Fecha)                      AS Mes,
       COUNT(*)                             AS Pedidos,
       SUM(pe.Subtotal)                     AS Articulos,
       SUM(pe.Descuento)                    AS Descuentos,
       SUM(pe.Envio)                        AS Envios,
       SUM(pe.Total)                        AS Ventas,
       SUM(pe.Iva)                          AS IvaIncluido,
       CAST(AVG(pe.Total) AS DECIMAL(12,2)) AS TicketPromedio
FROM dbo.Pedido pe
WHERE pe.Estado <> 'Cancelado'
  AND pe.Fecha >= @Desde AND pe.Fecha < DATEADD(DAY, 1, @Hasta)
GROUP BY YEAR(pe.Fecha), MONTH(pe.Fecha)
ORDER BY Anio, Mes;

-- 6. Ingreso por producto o combo: precio del detalle, no el precio actual; cancelados excluidos
SELECT CASE WHEN d.IdCombo IS NULL THEN N'Producto' ELSE N'Combo' END AS Tipo,
       COALESCE(p.Sku, cb.Slug)                                         AS Codigo,
       COALESCE(p.Nombre, cb.Nombre)                                    AS Articulo,
       COUNT(DISTINCT d.IdPedido)                                       AS Pedidos,
       SUM(d.Cantidad)                                                  AS Unidades,
       SUM(d.Importe)                                                   AS Ingreso,
       SUM(d.Importe - d.Cantidad * d.CostoUnitario)                    AS Margen,
       CAST(SUM(d.Importe) / COUNT(DISTINCT d.IdPedido) AS DECIMAL(12,2)) AS TicketPromedio
FROM dbo.PedidoDetalle d
JOIN dbo.Pedido pe ON pe.IdPedido = d.IdPedido
LEFT JOIN dbo.Producto p ON p.IdProducto = d.IdProducto
LEFT JOIN dbo.Combo cb ON cb.IdCombo = d.IdCombo
WHERE pe.Estado <> 'Cancelado'
  AND pe.Fecha >= @Desde AND pe.Fecha < DATEADD(DAY, 1, @Hasta)
GROUP BY CASE WHEN d.IdCombo IS NULL THEN N'Producto' ELSE N'Combo' END,
         COALESCE(p.Sku, cb.Slug), COALESCE(p.Nombre, cb.Nombre)
ORDER BY Ingreso DESC;

-- 7. Unidades físicas que salieron por producto, sueltas o dentro de combos (bitácora de inventario)
SELECT p.Sku,
       p.Nombre,
       -SUM(CASE WHEN m.Tipo = 'Venta' THEN m.Cantidad ELSE 0 END)     AS UnidadesVendidas,
       SUM(CASE WHEN m.Tipo = 'Devolucion' THEN m.Cantidad ELSE 0 END) AS UnidadesDevueltas,
       -SUM(m.Cantidad)                                                 AS UnidadesNetas
FROM dbo.MovimientoInventario m
JOIN dbo.Producto p ON p.IdProducto = m.IdProducto
WHERE m.Tipo IN ('Venta', 'Devolucion')
GROUP BY p.Sku, p.Nombre
ORDER BY UnidadesNetas DESC, p.Sku;

-- 8. Inventario valorizado por categoría (ejercicio de clase): productos activos y valor a costo y a precio
SELECT c.Nombre                               AS Categoria,
       COUNT(p.IdProducto)                    AS ProductosActivos,
       COALESCE(SUM(p.Stock), 0)              AS Unidades,
       COALESCE(SUM(p.Stock * p.Costo), 0)    AS ValorCosto,
       COALESCE(SUM(p.Stock * p.Precio), 0)   AS ValorVenta
FROM dbo.Categoria c
LEFT JOIN dbo.Producto p ON p.IdCategoria = c.IdCategoria AND p.Activo = 1
GROUP BY c.Nombre, c.Orden
ORDER BY c.Orden;

-- 9. Clientes con segmentación. LEFT JOIN conserva a quienes todavía no compran.
WITH ResumenCliente AS (
    SELECT c.IdCliente,
           c.Nombre,
           c.Correo,
           COUNT(pe.IdPedido)          AS Compras,
           COALESCE(SUM(pe.Total), 0)  AS TotalGastado,
           MAX(pe.Fecha)               AS UltimaCompra
    FROM dbo.Cliente c
    LEFT JOIN dbo.Pedido pe ON pe.IdCliente = c.IdCliente AND pe.Estado <> 'Cancelado'
    WHERE c.Activo = 1
    GROUP BY c.IdCliente, c.Nombre, c.Correo
)
SELECT IdCliente,
       Nombre,
       Correo,
       Compras,
       TotalGastado,
       UltimaCompra,
       CASE WHEN Compras = 0 THEN 'Nuevo'
            WHEN DATEDIFF(DAY, UltimaCompra, @Ahora) > @DiasInactivo THEN 'Inactivo'
            WHEN Compras >= @ComprasFrecuente THEN 'Frecuente'
            ELSE 'Ocasional' END AS Segmento
FROM ResumenCliente
ORDER BY TotalGastado DESC, Nombre;

-- 10. Pedidos por estado
SELECT pe.Estado,
       COUNT(*)      AS Pedidos,
       SUM(pe.Total) AS Monto
FROM dbo.Pedido pe
GROUP BY pe.Estado
ORDER BY CASE pe.Estado WHEN 'Pendiente' THEN 1 WHEN 'Pagado' THEN 2 WHEN 'Enviado' THEN 3
                        WHEN 'Entregado' THEN 4 ELSE 5 END;

-- 11. Horas promedio entre estados (desde el historial de cada pedido)
WITH Cambios AS (
    SELECT h.IdPedido,
           h.EstadoAnterior,
           h.EstadoNuevo,
           h.Fecha,
           LAG(h.Fecha) OVER (PARTITION BY h.IdPedido ORDER BY h.Fecha, h.IdHistorialEstado) AS FechaAnterior
    FROM dbo.HistorialEstadoPedido h
)
SELECT CONCAT(EstadoAnterior, ' -> ', EstadoNuevo)                         AS Transicion,
       COUNT(*)                                                              AS Veces,
       CAST(AVG(DATEDIFF(MINUTE, FechaAnterior, Fecha) / 60.0) AS DECIMAL(10,1)) AS HorasPromedio
FROM Cambios
WHERE EstadoAnterior IS NOT NULL
GROUP BY EstadoAnterior, EstadoNuevo
ORDER BY HorasPromedio;

-- 12. Seguimiento: pedidos Pendiente o Pagado que llevan más de las horas configuradas sin avanzar
SELECT pe.IdPedido,
       c.Nombre,
       c.Telefono,
       pe.Estado,
       pe.MetodoPago,
       pe.Total,
       u.UltimoCambio,
       DATEDIFF(HOUR, u.UltimoCambio, @Ahora) AS HorasEnEstado
FROM dbo.Pedido pe
JOIN dbo.Cliente c ON c.IdCliente = pe.IdCliente
CROSS APPLY (
    SELECT MAX(h.Fecha) AS UltimoCambio
    FROM dbo.HistorialEstadoPedido h
    WHERE h.IdPedido = pe.IdPedido
) u
WHERE pe.Estado IN ('Pendiente', 'Pagado')
  AND DATEDIFF(HOUR, u.UltimoCambio, @Ahora) > @HorasSeguimiento
ORDER BY HorasEnEstado DESC;

-- 13. Cupones vigentes hoy, con usos disponibles
SELECT cu.Codigo,
       cu.Descripcion,
       cu.Porcentaje,
       cu.FechaInicio,
       cu.FechaFin,
       cu.Usos,
       cu.UsoMaximo,
       CASE WHEN cu.UsoMaximo IS NULL THEN NULL ELSE cu.UsoMaximo - cu.Usos END AS UsosDisponibles
FROM dbo.Cupon cu
WHERE cu.Activo = 1
  AND @Ahora >= cu.FechaInicio AND @Ahora < cu.FechaFin
  AND (cu.UsoMaximo IS NULL OR cu.Usos < cu.UsoMaximo)
ORDER BY cu.FechaFin;

-- 14. Productos mejor calificados (mínimo de reseñas configurable arriba)
SELECT TOP (10)
       p.Sku,
       p.Nombre,
       CAST(AVG(CAST(r.Calificacion AS DECIMAL(3,1))) AS DECIMAL(2,1)) AS Calificacion,
       COUNT(*) AS Resenas
FROM dbo.Resena r
JOIN dbo.Producto p ON p.IdProducto = r.IdProducto
WHERE r.Visible = 1 AND p.Activo = 1
GROUP BY p.Sku, p.Nombre
HAVING COUNT(*) >= @MinResenas
ORDER BY Calificacion DESC, Resenas DESC, p.Sku;

-- 15. Control de inventario: el Stock de cada producto debe coincidir con la suma de su bitácora (vacío = cuadra)
SELECT p.Sku,
       p.Nombre,
       p.Stock,
       COALESCE(SUM(m.Cantidad), 0) AS StockSegunMovimientos
FROM dbo.Producto p
LEFT JOIN dbo.MovimientoInventario m ON m.IdProducto = p.IdProducto
GROUP BY p.Sku, p.Nombre, p.Stock
HAVING p.Stock <> COALESCE(SUM(m.Cantidad), 0);

-- 16. Historial de precios reciente
SELECT TOP (50)
       p.Sku,
       p.Nombre,
       h.PrecioAnterior,
       h.PrecioNuevo,
       h.Motivo,
       h.Usuario,
       h.Fecha
FROM dbo.HistorialPrecio h
JOIN dbo.Producto p ON p.IdProducto = h.IdProducto
ORDER BY h.Fecha DESC;
GO
