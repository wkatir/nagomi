import { createFormHook, revalidateLogic } from "@tanstack/react-form";
import { MediaField } from "../media-picker";
import { ComboboxField } from "./combobox-field";
import {
	CheckboxField,
	DateField,
	FormError,
	MoneyField,
	SaveButton,
	SelectField,
	SubmitButton,
	SwitchField,
	TextareaField,
	TextField,
} from "./fields";
import { fieldContext, formContext } from "./form-context";

// Nothing is said until the first submit, and from then on each change revalidates the whole
// form, so errors go away as the user fixes them. (A schema on `onSubmit` and `onChange` leaves
// its errors on fields the user did not touch, and the form then refuses to submit without saying
// why.) Use it with the schema as `validators.onDynamic`.
export const validationLogic = revalidateLogic();

export const { useAppForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		ComboboxField,
		MediaField,
		TextField,
		TextareaField,
		MoneyField,
		SelectField,
		CheckboxField,
		SwitchField,
		DateField,
	},
	formComponents: { SubmitButton, SaveButton, FormError },
});
