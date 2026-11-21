import { Hono } from "hono";
import { type AdminEnv, requireAdmin } from "../../auth";
import { auditRouter } from "./audit";
import { brandsRouter } from "./brands";
import { categoriesRouter } from "./categories";
import { collectionsRouter } from "./collections";
import { concernsRouter } from "./concerns";
import { customersRouter } from "./customers";
import { dashboardRouter } from "./dashboard";
import { exportsRouter } from "./exports";
import { homeSlidesRouter } from "./home-slides";
import { inventoryRouter } from "./inventory";
import { invoicesRouter } from "./invoices";
import { mediaFilesRouter, mediaRouter } from "./media";
import { ordersRouter } from "./orders";
import { productsRouter } from "./products";
import { promotionsRouter } from "./promotions";
import { purchasingRouter } from "./purchasing";
import { reportsRouter } from "./reports";
import { routinesRouter } from "./routines";
import { searchRouter } from "./search";
import { settingsRouter } from "./settings";
import { shippingRouter } from "./shipping";
import { suppliersRouter } from "./suppliers";

export const admin = new Hono<AdminEnv>()
	.use("*", requireAdmin)
	.route("/dashboard", dashboardRouter)
	.route("/products", productsRouter)
	.route("/product-images", mediaRouter)
	.route("/media", mediaFilesRouter)
	.route("/brands", brandsRouter)
	.route("/categories", categoriesRouter)
	.route("/concerns", concernsRouter)
	.route("/routines", routinesRouter)
	.route("/collections", collectionsRouter)
	.route("/home-slides", homeSlidesRouter)
	.route("/promotions", promotionsRouter)
	.route("/suppliers", suppliersRouter)
	.route("/purchase-orders", purchasingRouter)
	.route("/inventory", inventoryRouter)
	.route("/orders", ordersRouter)
	.route("/customers", customersRouter)
	.route("/reports", reportsRouter)
	.route("/search", searchRouter)
	.route("/exports", exportsRouter)
	.route("/audit-events", auditRouter)
	.route("/settings", settingsRouter)
	.route("/shipping-zones", shippingRouter)
	.route("/invoices", invoicesRouter);
