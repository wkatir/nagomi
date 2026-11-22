import { Hono } from "hono";
import { getDb } from "#/db";
import type { AdminEnv } from "#/server/auth";
import { overdueOrders } from "../../domain/followups";

export const followupsRouter = new Hono<AdminEnv>().get("/", async (c) =>
	c.json({ orders: await overdueOrders(getDb()) }),
);
