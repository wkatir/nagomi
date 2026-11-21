import type {
	MovementReason,
	ReturnDisposition,
	ReturnReason,
} from "#/db/schema";
import { addDays, daysBetween } from "#/lib/dates";
import type { Granularity } from "#/lib/schemas/reports";
import { isExpired } from "./fefo";
import { e4ToMinor } from "./receiving";

// Every report works on the store's local calendar days (YYYY-MM-DD in
// store_settings.time_zone); src/lib/dates.ts turns them into UTC bounds, DST-safe.

// Weeks start on Monday (ISO 8601).
export function periodStart(date: string, granularity: Granularity): string {
	if (granularity === "day") return date;
	if (granularity === "month") return `${date.slice(0, 7)}-01`;
	// 1970-01-05 was a Monday.
	const weekday = (((daysBetween("1970-01-05", date) % 7) + 7) % 7) as number;
	return addDays(date, -weekday);
}

export function periodEnd(start: string, granularity: Granularity): string {
	if (granularity === "day") return start;
	if (granularity === "week") return addDays(start, 6);
	const [year, month] = start.split("-").map(Number) as [number, number];
	const next =
		month === 12
			? `${year + 1}-01-01`
			: `${year}-${String(month + 1).padStart(2, "0")}-01`;
	return addDays(next, -1);
}

type Period = {
	period: string;
	from: string;
	to: string;
	partial: boolean;
};

export function periods(
	from: string,
	to: string,
	granularity: Granularity,
): Period[] {
	if (from > to) throw new Error(`Range ${from}..${to} is reversed`);
	const out: Period[] = [];
	for (
		let start = periodStart(from, granularity);
		start <= to;
		start = addDays(periodEnd(start, granularity), 1)
	) {
		const end = periodEnd(start, granularity);
		out.push({
			period: start,
			from: start < from ? from : start,
			to: end > to ? to : end,
			partial: start < from || end > to,
		});
	}
	return out;
}

type LotBalance = {
	lotId: number;
	variantId: number;
	expiresOn: string;
	available: number;
	unitCostE4: number;
};

type StockFigures = {
	onHand: number;
	value: number;
	atRiskUnits: number;
	atRiskValue: number;
	// To write off, not an asset.
	expiredUnits: number;
	expiredValue: number;
};

type StockAcc = Record<
	"onHand" | "valueE4" | "atRisk" | "atRiskE4" | "expired" | "expiredE4",
	number
>;

const emptyStock = (): StockAcc => ({
	onHand: 0,
	valueE4: 0,
	atRisk: 0,
	atRiskE4: 0,
	expired: 0,
	expiredE4: 0,
});

const stockFigures = (a: StockAcc): StockFigures => ({
	onHand: a.onHand,
	value: e4ToMinor(a.valueE4),
	atRiskUnits: a.atRisk,
	atRiskValue: e4ToMinor(a.atRiskE4),
	expiredUnits: a.expired,
	expiredValue: e4ToMinor(a.expiredE4),
});

// A lot still sells through its expiry date.
export const expiresWithin = (
	expiresOn: string,
	today: string,
	windowDays: number,
) => !isExpired(expiresOn, today) && expiresOn <= addDays(today, windowDays);

// Valued at landed lot cost.
export function stockPosition(
	lots: LotBalance[],
	today: string,
	windowDays: number,
) {
	const total = emptyStock();
	const byVariant = new Map<number, StockAcc>();
	for (const lot of lots) {
		if (lot.available < 0)
			throw new Error(`Lot ${lot.lotId} has a negative balance`);
		if (lot.available === 0) continue;
		const value = lot.available * lot.unitCostE4;
		const acc = byVariant.get(lot.variantId) ?? emptyStock();
		for (const a of [acc, total]) {
			if (isExpired(lot.expiresOn, today)) {
				a.expired += lot.available;
				a.expiredE4 += value;
			} else {
				a.onHand += lot.available;
				a.valueE4 += value;
				if (expiresWithin(lot.expiresOn, today, windowDays)) {
					a.atRisk += lot.available;
					a.atRiskE4 += value;
				}
			}
		}
		byVariant.set(lot.variantId, acc);
	}
	return {
		total: stockFigures(total),
		byVariant: new Map(
			[...byVariant].map(([id, acc]) => [id, stockFigures(acc)] as const),
		),
	};
}

export type LossMovement = {
	kind: "waste" | "adjustment";
	reason: MovementReason | null;
	quantity: number;
	unitCostE4: number;
};

// Adjustments are signed: negative is shrinkage, positive is stock found.
export function stockLosses(movements: LossMovement[]) {
	const writeOffs = new Map<
		MovementReason,
		{ units: number; costE4: number }
	>();
	let adjustmentUnits = 0;
	let adjustmentE4 = 0;
	for (const m of movements) {
		if (m.kind === "waste") {
			if (m.quantity >= 0) throw new Error("Waste must be negative");
			// NOT NULL for waste: CHECK inventory_movements_reason_required.
			if (m.reason === null) throw new Error("Waste must have a reason");
			const row = writeOffs.get(m.reason) ?? { units: 0, costE4: 0 };
			row.units += -m.quantity;
			row.costE4 += -m.quantity * m.unitCostE4;
			writeOffs.set(m.reason, row);
		} else {
			adjustmentUnits += m.quantity;
			adjustmentE4 += m.quantity * m.unitCostE4;
		}
	}
	const reasons = [...writeOffs]
		.map(([reason, r]) => ({
			reason,
			units: r.units,
			cost: e4ToMinor(r.costE4),
		}))
		.sort((a, b) => b.cost - a.cost || a.reason.localeCompare(b.reason));
	const totalE4 = [...writeOffs.values()].reduce((n, r) => n + r.costE4, 0);
	return {
		writeOffs: {
			units: reasons.reduce((n, r) => n + r.units, 0),
			cost: e4ToMinor(totalE4),
			byReason: reasons,
		},
		adjustments: {
			units: adjustmentUnits,
			value: e4ToMinor(adjustmentE4),
		},
		// Write-offs plus net shrinkage (positive adjustments reduce it).
		totalLoss: e4ToMinor(totalE4 - adjustmentE4),
	};
}

export type ReturnedLine = {
	returnId: number;
	reason: ReturnReason;
	disposition: ReturnDisposition;
	quantity: number;
	unitPrice: number;
	unitCostE4: number;
};

// By the local day of the return, whatever the period of the sale; value is at the order
// price before discount.
export function returnsSummary(lines: ReturnedLine[]) {
	const reasons = new Map<
		ReturnReason,
		{ returns: Set<number>; units: number; value: number }
	>();
	const totals = {
		returns: new Set<number>(),
		units: 0,
		value: 0,
		restockedUnits: 0,
		restockedE4: 0,
		writtenOffUnits: 0,
		writtenOffE4: 0,
	};
	for (const l of lines) {
		const value = l.quantity * l.unitPrice;
		const cost = l.quantity * l.unitCostE4;
		const r = reasons.get(l.reason) ?? {
			returns: new Set<number>(),
			units: 0,
			value: 0,
		};
		r.returns.add(l.returnId);
		r.units += l.quantity;
		r.value += value;
		reasons.set(l.reason, r);
		totals.returns.add(l.returnId);
		totals.units += l.quantity;
		totals.value += value;
		if (l.disposition === "restock") {
			totals.restockedUnits += l.quantity;
			totals.restockedE4 += cost;
		} else {
			totals.writtenOffUnits += l.quantity;
			totals.writtenOffE4 += cost;
		}
	}
	return {
		returns: totals.returns.size,
		units: totals.units,
		value: totals.value,
		restocked: {
			units: totals.restockedUnits,
			cost: e4ToMinor(totals.restockedE4),
		},
		writtenOff: {
			units: totals.writtenOffUnits,
			cost: e4ToMinor(totals.writtenOffE4),
		},
		byReason: [...reasons]
			.map(([reason, r]) => ({
				reason,
				returns: r.returns.size,
				units: r.units,
				value: r.value,
			}))
			.sort((a, b) => b.value - a.value || a.reason.localeCompare(b.reason)),
	};
}
