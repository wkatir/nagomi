import locations from "./sv-locations.json";

export const SV_LOCATIONS: readonly {
	department: string;
	municipalities: readonly string[];
}[] = locations;

export const SV_MUNICIPALITIES = SV_LOCATIONS.flatMap((l) => l.municipalities);

export const isSvMunicipality = (department: string, municipality: string) =>
	SV_LOCATIONS.some(
		(l) =>
			l.department === department && l.municipalities.includes(municipality),
	);

export const SV_PHONE_REGEX = /^\+503[0-9]{8}$/;
