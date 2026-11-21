import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export function QueryError({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
				{errorMessage(error)}
				<Button variant="outline" size="sm" onClick={onRetry}>
					{m.admin_table_retry()}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
