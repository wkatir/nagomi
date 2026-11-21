import { Fact, Section } from "#/components/admin/section";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { m } from "#/paraglide/messages";
import type { InvoiceConnection } from "./queries";

export function InvoicingSettings({
	connection,
}: {
	connection: InvoiceConnection;
}) {
	const { configured, host, types, error } = connection;
	return (
		<Section title={m.admin_invoicing_title()}>
			<div className="grid gap-admin-stack p-admin-card">
				<dl className="grid gap-admin-stack">
					<Fact
						label={m.admin_invoicing_state()}
						value={
							<Badge variant={configured ? "default" : "outline"}>
								{configured
									? m.admin_invoicing_configured()
									: m.admin_invoicing_not_configured()}
							</Badge>
						}
					/>
					<Fact label={m.admin_invoicing_host()} value={host} />
					{configured && !error && (
						<Fact
							label={m.admin_invoicing_types()}
							value={
								types.length === 0 ? (
									m.admin_invoicing_no_types()
								) : (
									<ul className="grid gap-1">
										{types.map((type) => (
											<li
												key={type.codigo}
												className="flex flex-wrap items-center gap-2"
											>
												<span>
													{type.codigo} {type.nombre}
												</span>
												<Badge
													variant={type.habilitado ? "default" : "outline"}
												>
													{type.habilitado
														? m.admin_invoicing_type_enabled()
														: m.admin_invoicing_type_disabled()}
												</Badge>
											</li>
										))}
									</ul>
								)
							}
						/>
					)}
				</dl>
				{error && (
					<Alert variant="destructive">
						<AlertDescription className="break-words">
							{m.admin_invoicing_error({ message: error })}
						</AlertDescription>
					</Alert>
				)}
				<div className="grid gap-1 border-t pt-admin-stack">
					<p className="type-meta text-muted-foreground">
						{m.admin_invoicing_when()}
					</p>
					<p className="type-meta text-muted-foreground">
						{m.admin_invoicing_secret()}
					</p>
				</div>
			</div>
		</Section>
	);
}
