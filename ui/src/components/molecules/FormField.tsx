import { useId, cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";
import { cn } from "@/ui/lib/utils";

interface FormFieldProps {
	label: string;
	error?: string;
	required?: boolean;
	className?: string;
	id?: string;
	children: ReactNode;
}

export function FormField({ label, error, required, className, id: externalId, children }: FormFieldProps) {
	const generatedId = useId();
	const fieldId = externalId || generatedId;

	// Clone the child element to inject the id prop for label linking
	const childWithId = isValidElement(children)
		? cloneElement(children as ReactElement<{ id?: string }>, { id: fieldId })
		: children;

	return (
		<div className={cn("space-y-1.5", className)}>
			<label htmlFor={fieldId} className="text-sm font-medium text-foreground">
				{label}
				{required && <span className="text-destructive ml-1">*</span>}
			</label>
			{childWithId}
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}
