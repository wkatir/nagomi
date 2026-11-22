import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mediaFilesQuery, uploadMedia } from "#/features/media/queries";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";

export function useUploadImages() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (files: File[]) => {
			let stored = 0;
			for (const file of files) {
				try {
					await uploadMedia(file);
					stored += 1;
				} catch (error) {
					toast.error(`${file.name}: ${errorMessage(error)}`);
				}
			}
			return stored;
		},
		onSuccess: async (stored) => {
			await queryClient.invalidateQueries({
				queryKey: mediaFilesQuery.queryKey,
			});
			if (stored > 0)
				toast.success(m.admin_library_uploaded({ count: stored }));
		},
	});
}
