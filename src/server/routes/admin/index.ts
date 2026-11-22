import { Hono } from "hono";
import { type AdminEnv, requireArea, requireStaff } from "../../auth";
import { ADMIN_AREAS } from "./areas";
import { auditRouter } from "./audit";
import { brandsRouter } from "./brands";
import { bundlesRouter } from "./bundles";
import { categoriesRouter } from "./categories";
import { collectionsRouter } from "./collections";
import { customersRouter } from "./customers";
import { dashboardRouter } from "./dashboard";
import { exportsRouter } from "./exports";
import { followupsRouter } from "./followups";
import { homeSlidesRouter } from "./home-slides";
import { inventoryRouter } from "./inventory";
import { mediaFilesRouter, mediaRouter } from "./media";
import { ordersRouter } from "./orders";
import { productsRouter } from "./products";
import { promotionsRouter } from "./promotions";
import { purchasingRouter } from "./purchasing";
import { reportsRouter } from "./reports";
import { searchRouter } from "./search";
import { settingsRouter } from "./settings";
import { shippingRouter } from "./shipping";
import { suppliersRouter } from "./suppliers";

const staff = new Hono<AdminEnv>().use("*", requireStaff);
for (const [prefix, area] of Object.entries(ADMIN_AREAS))
	staff.use(`${prefix}/*`, requireArea(area));

export const admin = staff
	.route("/dashboard", dashboardRouter)
	.route("/products", productsRouter)
	.route("/product-images", mediaRouter)
	.route("/media", mediaFilesRouter)
	.route("/brands", brandsRouter)
	.route("/categories", categoriesRouter)
	.route("/bundles", bundlesRouter)
	.route("/collections", collectionsRouter)
	.route("/home-slides", homeSlidesRouter)
	.route("/promotions", promotionsRouter)
	.route("/suppliers", suppliersRouter)
	.route("/purchase-orders", purchasingRouter)
	.route("/inventory", inventoryRouter)
	.route("/orders", ordersRouter)
	.route("/followups", followupsRouter)
	.route("/customers", customersRouter)
	.route("/reports", reportsRouter)
	.route("/search", searchRouter)
	.route("/exports", exportsRouter)
	.route("/audit-events", auditRouter)
	.route("/settings", settingsRouter)
	.route("/shipping-zones", shippingRouter);
