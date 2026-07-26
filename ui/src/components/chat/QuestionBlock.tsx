import { useEffect, useMemo, useState } from "react";
import {
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CircleDot,
	Loader2,
	MessageSquareQuote,
	XCircle,
} from "lucide-react";

import type { ChatQuestionBlock } from "../../models/chat";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

interface QuestionBlockProps {
	block: ChatQuestionBlock;
	onSubmit?: (blockId: string, answers: string[][]) => Promise<void> | void;
	onReject?: (blockId: string) => Promise<void> | void;
	variant?: "inline" | "prompt";
}

function normalizeDraftAnswers(block: ChatQuestionBlock): string[][] {
	return block.prompts.map((_, index) => block.selectedAnswers?.[index] || []);
}

function normalizeCustomAnswers(block: ChatQuestionBlock): string[] {
	return block.prompts.map((prompt, index) => {
		const selected = block.selectedAnswers?.[index] || [];
		const optionLabels = new Set(prompt.options.map((o) => o.label));
		return selected.find((a) => !optionLabels.has(a)) || "";
	});
}

export function QuestionBlock({ block, onSubmit, onReject, variant = "inline" }: QuestionBlockProps) {
	const [draftAnswers, setDraftAnswers] = useState<string[][]>(() => normalizeDraftAnswers(block));
	const [customAnswers, setCustomAnswers] = useState<string[]>(() => normalizeCustomAnswers(block));
	const [resolvedOpen, setResolvedOpen] = useState(true);
	const [currentStep, setCurrentStep] = useState(0);

	useEffect(() => {
		setDraftAnswers(normalizeDraftAnswers(block));
		setCustomAnswers(normalizeCustomAnswers(block));
	}, [block]);

	useEffect(() => {
		setCurrentStep(0);
	}, [block.id]);

	const isSubmitting = block.status === "submitting";
	const isRejecting = block.status === "rejecting";
	const isResolved = block.status === "submitted" || block.status === "rejected";
	const isRejected = block.status === "rejected";
	const isPromptVariant = variant === "prompt";

	const totalSteps = block.prompts.length;
	const isLastStep = currentStep === totalSteps - 1;
	const prompt = block.prompts[currentStep];

	const effectiveAnswers = useMemo(
		() =>
			block.prompts.map((p, index) => {
				const selected = draftAnswers[index] || [];
				const custom = customAnswers[index]?.trim();
				if (!custom) return selected;
				return p.multiple ? [...selected, custom] : [custom];
			}),
		[block.prompts, customAnswers, draftAnswers],
	);

	const canProceed = (effectiveAnswers[currentStep] || []).length > 0;
	const canSubmit = useMemo(() => effectiveAnswers.every((a) => a.length > 0), [effectiveAnswers]);

	const resolvedAnswers = useMemo(
		() =>
			block.prompts.map((_, index) => {
				const answers = block.selectedAnswers?.[index] || [];
				return answers.filter((a) => a.trim().length > 0);
			}),
		[block.prompts, block.selectedAnswers],
	);

	const toggleOption = (promptIndex: number, label: string, multiple = false) => {
		setDraftAnswers((prev) =>
			prev.map((answers, i) => {
				if (i !== promptIndex) return answers;
				if (!multiple) return [label];
				return answers.includes(label) ? answers.filter((x) => x !== label) : [...answers, label];
			}),
		);
		if (!multiple) {
			setCustomAnswers((prev) => prev.map((a, i) => (i === promptIndex ? "" : a)));
		}
	};

	const frameClassName = cn(
		"overflow-hidden rounded-lg border",
		isPromptVariant
			? "border-primary/20 bg-primary/5"
			: "border-border/50 bg-muted/30",
	);

	if (isResolved) {
		return (
			<div className={cn("my-2", isPromptVariant ? "" : "max-w-2xl")}>
				<div className={frameClassName}>
					<button
						type="button"
						onClick={() => setResolvedOpen((value) => !value)}
						className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 sm:py-2 text-left hover:bg-muted/50 transition-colors"
					>
						<div className="flex min-w-0 items-center gap-2.5">
							<div
								className={cn(
									"flex h-5 w-5 shrink-0 items-center justify-center rounded",
									isRejected
										? "text-red-500"
										: "text-emerald-600",
								)}
							>
								{isRejected ? <XCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <CheckCircle2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
							</div>
							<div className="min-w-0">
								<div className="text-sm sm:text-xs font-medium text-foreground">
									{block.prompts.length} question{block.prompts.length > 1 ? "s" : ""} {isRejected ? "skipped" : "answered"}
								</div>
							</div>
						</div>
						<ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", !resolvedOpen && "-rotate-90")} />
					</button>
					{resolvedOpen && (
						<div className="space-y-2 border-t border-border/40 px-3 py-2.5 sm:py-2">
							{block.prompts.map((p, i) => {
								const answers = resolvedAnswers[i] || [];
								return (
									<div key={`${block.id}_${i}`} className="rounded-md bg-background/60 px-2.5 py-2">
										<div className="text-sm sm:text-xs font-medium text-foreground/80">
											{p.question}
										</div>
										<div className="mt-1 text-sm sm:text-xs text-muted-foreground">
											{isRejected ? "—" : answers.length > 0 ? answers.join(", ") : "—"}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		);
	}

	if (!prompt) return null;

	const selected = draftAnswers[currentStep] || [];

	return (
		<div className={cn("my-2", isPromptVariant ? "" : "max-w-2xl")}>
			<div className={frameClassName}>
				<div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-3 sm:py-2.5">
					<div className="flex min-w-0 items-center gap-2.5">
						<div
							className={cn(
								"flex h-5 w-5 shrink-0 items-center justify-center rounded",
								isPromptVariant ? "text-primary" : "text-muted-foreground",
							)}
						>
							<MessageSquareQuote className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<div className="text-sm sm:text-xs font-medium leading-snug text-foreground">{prompt.question}</div>
							{prompt.header && (
								<div className="mt-0.5 text-xs sm:text-[11px] text-muted-foreground">{prompt.header}</div>
							)}
						</div>
					</div>
					{totalSteps > 1 && (
						<div className="rounded-md bg-muted/50 px-2 py-0.5 text-xs sm:text-[11px] tabular-nums text-muted-foreground">
							{currentStep + 1}/{totalSteps}
						</div>
					)}
				</div>

				{totalSteps > 1 && (
					<div className="flex flex-wrap gap-1.5 border-t border-border/40 px-3 py-2.5 sm:py-2">
						{block.prompts.map((stepPrompt, index) => {
							const stepAnswered = (effectiveAnswers[index] || []).length > 0;
							const active = index === currentStep;
							return (
								<button
									key={`${block.id}_step_${index}`}
									type="button"
									onClick={() => setCurrentStep(index)}
									disabled={isSubmitting || isRejecting}
									className={cn(
										"flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 sm:px-2 sm:py-1 text-xs sm:text-[11px] transition-colors",
										active
											? "border-primary/30 bg-primary/10 text-primary"
											: stepAnswered
												? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
												: "border-border/50 bg-background/60 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
									)}
								>
									<span className="tabular-nums">{index + 1}</span>
									<span className="max-w-24 truncate text-[11px] sm:text-[10px]">{stepPrompt.header || `Q${index + 1}`}</span>
								</button>
							);
						})}
					</div>
				)}

				<div className="space-y-2 px-3 py-3 sm:py-2.5">
					<div className="space-y-2 sm:space-y-1.5">
						{prompt.options.map((option) => {
							const checked = selected.includes(option.label);
							return (
								<button
									key={option.label}
									type="button"
									onClick={() => toggleOption(currentStep, option.label, prompt.multiple)}
									disabled={isSubmitting || isRejecting}
									className={cn(
										"flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 sm:px-2.5 sm:py-2 text-left text-sm transition-colors",
										checked
											? "border-primary/30 bg-primary/8 text-foreground"
											: "border-border/50 bg-background/60 text-foreground/85 hover:border-border hover:bg-accent/40",
										(isSubmitting || isRejecting) && "pointer-events-none",
									)}
								>
									{prompt.multiple ? (
										<Checkbox checked={checked} className="mt-0.5 h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" />
									) : (
										<div
											className={cn(
												"mt-0.5 h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0 rounded-full border transition-colors",
												checked ? "border-primary border-[3px]" : "border-muted-foreground/30",
											)}
										/>
									)}
									<div className="min-w-0 flex-1">
										<span className="text-sm sm:text-xs font-medium">{option.label}</span>
										{option.description && <div className="mt-0.5 text-xs sm:text-[11px] leading-relaxed text-muted-foreground">{option.description}</div>}
									</div>
								</button>
							);
						})}
					</div>

					<div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2.5 sm:px-2.5 sm:py-2">
						<textarea
							value={customAnswers[currentStep] || ""}
							onChange={(e) => setCustomAnswers((prev) => prev.map((a, i) => (i === currentStep ? e.target.value : a)))}
							disabled={isSubmitting || isRejecting}
							placeholder="Or type your own answer..."
							rows={1}
							className="w-full resize-none bg-transparent text-sm sm:text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
							style={{ minHeight: "24px" }}
							onInput={(e) => {
								const el = e.currentTarget;
								el.style.height = "auto";
								el.style.height = `${el.scrollHeight}px`;
							}}
						/>
					</div>

					{block.error && <div className="text-xs sm:text-[11px] font-medium text-destructive">{block.error}</div>}

					<div className="flex flex-wrap items-center gap-2 sm:gap-1.5 border-t border-border/40 pt-2.5 sm:pt-2 mt-1">
						{onReject && (
							<Button
								type="button"
								onClick={() => onReject(block.id)}
								disabled={isSubmitting || isRejecting}
								variant="ghost"
								size="sm"
								className="h-8 sm:h-7 rounded-md px-2.5 sm:px-2 text-xs sm:text-[11px] text-muted-foreground"
							>
								{isRejecting ? <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" /> : "Skip"}
							</Button>
						)}
						<div className="hidden flex-1 sm:block" />
						{currentStep > 0 && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-8 sm:h-7 rounded-md px-3 sm:px-2.5 text-xs sm:text-[11px]"
								onClick={() => setCurrentStep((s) => s - 1)}
								disabled={isSubmitting || isRejecting}
							>
								<ChevronLeft className="h-4 w-4 sm:h-3 sm:w-3" />
								Back
							</Button>
						)}
						{!isLastStep ? (
							<Button
								size="sm"
								variant="outline"
								className="h-8 sm:h-7 rounded-md px-3 sm:px-2.5 text-xs sm:text-[11px] font-medium text-primary"
								onClick={() => setCurrentStep((s) => s + 1)}
								disabled={!canProceed || isSubmitting || isRejecting}
							>
								Next
								<ChevronRight className="h-4 w-4 sm:h-3 sm:w-3" />
							</Button>
						) : (
							onSubmit && (
								<Button
									size="sm"
									className="h-8 sm:h-7 rounded-md px-3 sm:px-2.5 text-xs sm:text-[11px] font-medium"
									onClick={() => onSubmit(block.id, effectiveAnswers)}
									disabled={!canSubmit || isSubmitting || isRejecting}
								>
									{isSubmitting ? (
										<Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
									) : (
										<>
											Submit
											<ChevronRight className="h-4 w-4 sm:h-3 sm:w-3" />
										</>
									)}
								</Button>
							)
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
