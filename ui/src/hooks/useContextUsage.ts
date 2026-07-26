import { useMemo } from "react";
import type { ChatMessage } from "../models/chat";

import type { OpenCodeProviderResponse } from "../api/client";

// ─── Known model context limits (tokens) — fallback only ─────────────────────
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
	// Claude
	"claude-sonnet-4-20250514": 200_000,
	"claude-opus-4-20250514": 200_000,
	"claude-3-7-sonnet-20250219": 200_000,
	"claude-3-5-sonnet-20241022": 200_000,
	"claude-3-5-sonnet-20240620": 200_000,
	"claude-3-5-haiku-20241022": 200_000,
	"claude-3-opus-20240229": 200_000,
	"claude-3-haiku-20240307": 200_000,
	// GPT
	"gpt-4o": 128_000,
	"gpt-4o-mini": 128_000,
	"gpt-4-turbo": 128_000,
	"gpt-4": 8_192,
	"o1": 200_000,
	"o1-mini": 128_000,
	"o1-pro": 200_000,
	"o3": 200_000,
	"o3-mini": 200_000,
	"o4-mini": 200_000,
	// GPT-5
	"gpt-5": 1_000_000,
	"gpt-5.4": 1_000_000,
	"gpt-5-mini": 1_000_000,
	// Gemini
	"gemini-2.5-pro": 1_048_576,
	"gemini-2.5-flash": 1_048_576,
	"gemini-2.0-flash": 1_048_576,
	"gemini-1.5-pro": 2_097_152,
	"gemini-1.5-flash": 1_048_576,
	// DeepSeek
	"deepseek-chat": 64_000,
	"deepseek-reasoner": 64_000,
	// Mistral
	"mistral-large-latest": 128_000,
	"codestral-latest": 256_000,
	// MiniMax
	"MiniMax-M1": 1_000_000,
	"MiniMax-M1-highspeed": 1_000_000,
	"MiniMax-M2.5": 1_000_000,
	"MiniMax-M2.7": 204_800,
	"MiniMax-M2.7-highspeed": 204_800,
};

export interface ContextCategory {
	key: string;
	label: string;
	tokens: number;
	percent: number;
	color: string;
}

export interface ContextUsageData {
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cacheTokens: number;
	contextLimit: number | null;
	usagePercent: number | null;
	cost: number;
	categories: ContextCategory[];
	messageCount: number;
	userMessageCount: number;
	assistantMessageCount: number;
}

// Category colors
const COLORS = {
	toolUse: "#f97316",    // orange
	messages: "#3b82f6",   // blue
	reasoning: "#a855f7",  // purple
	cache: "#22c55e",      // green
	free: "var(--muted)",  // muted
};

function lookupContextLimit(
	modelID: string | undefined,
	providerID: string | undefined,
	providerResponse: OpenCodeProviderResponse | null | undefined,
): number | null {
	if (!modelID) return null;

	// 1. Try provider API data first (dynamic, always up-to-date)
	if (providerResponse?.all && providerID) {
		const provider = providerResponse.all.find((p) => p.id === providerID);
		if (provider?.models) {
			const model = provider.models[modelID];
			if (model?.limit?.context) return model.limit.context;
			if (model?.limit?.input) return model.limit.input;
		}
	}
	// Also search all providers if providerID didn't match
	if (providerResponse?.all) {
		let bestLimit: number | null = null;
		for (const provider of providerResponse.all) {
			if (!provider.models) continue;
			const model = provider.models[modelID];
			const ctx = model?.limit?.context || model?.limit?.input;
			if (ctx && (bestLimit === null || ctx > bestLimit)) {
				bestLimit = ctx;
			}
		}
		if (bestLimit) return bestLimit;
	}

	// 2. Fallback to hardcode map
	if (MODEL_CONTEXT_LIMITS[modelID]) return MODEL_CONTEXT_LIMITS[modelID];
	const lower = modelID.toLowerCase();
	for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
		if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
			return limit;
		}
	}
	return null;
}

function estimateToolTokens(messages: ChatMessage[]): number {
	let tokens = 0;
	for (const msg of messages) {
		if (!msg.toolCalls) continue;
		for (const tool of msg.toolCalls) {
			// Estimate: input JSON + output text, ~4 chars per token
			const inputStr = JSON.stringify(tool.input);
			const outputStr = tool.output || "";
			tokens += Math.ceil((inputStr.length + outputStr.length) / 4);
		}
	}
	return tokens;
}

function estimateReasoningTokens(messages: ChatMessage[]): number {
	let tokens = 0;
	for (const msg of messages) {
		if (msg.reasoning) {
			tokens += Math.ceil(msg.reasoning.length / 4);
		}
	}
	return tokens;
}

function estimateMessageTokens(messages: ChatMessage[]): number {
	let tokens = 0;
	for (const msg of messages) {
		tokens += Math.ceil(msg.content.length / 4);
	}
	return tokens;
}

export function useContextUsage(
	messages: ChatMessage[] | undefined,
	modelID: string | undefined,
	providerID?: string,
	providerResponse?: OpenCodeProviderResponse | null,
): ContextUsageData {
	return useMemo(() => {
		const msgs = messages || [];
		// Try provided modelID first, then infer from last assistant message
		let effectiveModelID = modelID;
		let effectiveProviderID = providerID;
		if (!effectiveModelID || !effectiveProviderID) {
			for (let i = msgs.length - 1; i >= 0; i--) {
				const msg = msgs[i];
				if (msg && msg.role === "assistant" && msg.model) {
					if (!effectiveModelID) effectiveModelID = msg.model;
					if (!effectiveProviderID) effectiveProviderID = msg.providerID;
					break;
				}
			}
		}
		const contextLimit = lookupContextLimit(effectiveModelID, effectiveProviderID, providerResponse);

		// Find last assistant message — its inputTokens represents actual context size
		// (after compaction, this reflects the compacted context, not the full history)
		let lastInputTokens = 0;
		let lastOutputTokens = 0;
		let totalCost = 0;
		let userCount = 0;
		let assistantCount = 0;

		for (const msg of msgs) {
			if (msg.role === "user") userCount++;
			else assistantCount++;
			totalCost += msg.cost || 0;
		}

		// Use highest inputTokens from any assistant message as context usage
		// Each turn's inputTokens includes full conversation history, so max = current context size
		for (const msg of msgs) {
			if (msg.role === "assistant") {
				const msgInput = msg.inputTokens || 0;
				const msgOutput = msg.outputTokens || 0;
				if (msgInput > lastInputTokens) {
					lastInputTokens = msgInput;
				}
				lastOutputTokens += msgOutput;
			}
		}

		// Fallback: if no input tokens found, sum all
		if (lastInputTokens === 0 && lastOutputTokens === 0) {
			for (const msg of msgs) {
				lastInputTokens += msg.inputTokens || 0;
				lastOutputTokens += msg.outputTokens || 0;
			}
		}

		// Context usage = max inputTokens (what the model actually sees)
		const contextUsed = lastInputTokens;
		const totalTokens = lastInputTokens + lastOutputTokens;

		// Estimate category breakdown from content proportions
		const estTool = estimateToolTokens(msgs);
		const estReasoning = estimateReasoningTokens(msgs);
		const estMessages = estimateMessageTokens(msgs);
		const estTotal = estTool + estReasoning + estMessages;

		// Scale estimates to match actual context used
		const scale = estTotal > 0 ? contextUsed / estTotal : 0;
		const toolTokens = Math.round(estTool * scale);
		const reasoningTokens = Math.round(estReasoning * scale);
		const messageTokens = Math.round(estMessages * scale);

		const usagePercent = contextLimit ? Math.min((contextUsed / contextLimit) * 100, 100) : null;

		const categories: ContextCategory[] = [
			{
				key: "toolUse",
				label: "Tool use & results",
				tokens: toolTokens,
				percent: contextLimit ? (toolTokens / contextLimit) * 100 : 0,
				color: COLORS.toolUse,
			},
			{
				key: "messages",
				label: "Messages",
				tokens: messageTokens,
				percent: contextLimit ? (messageTokens / contextLimit) * 100 : 0,
				color: COLORS.messages,
			},
			{
				key: "reasoning",
				label: "Reasoning",
				tokens: reasoningTokens,
				percent: contextLimit ? (reasoningTokens / contextLimit) * 100 : 0,
				color: COLORS.reasoning,
			},
		];

		if (contextLimit) {
			const freeTokens = Math.max(contextLimit - contextUsed, 0);
			categories.push({
				key: "free",
				label: "Free space",
				tokens: freeTokens,
				percent: (freeTokens / contextLimit) * 100,
				color: COLORS.free,
			});
		}

		return {
			totalTokens,
			inputTokens: lastInputTokens,
			outputTokens: lastOutputTokens,
			reasoningTokens,
			cacheTokens: 0,
			contextLimit,
			usagePercent,
			cost: totalCost,
			categories,
			messageCount: msgs.length,
			userMessageCount: userCount,
			assistantMessageCount: assistantCount,
		};
	}, [messages, modelID, providerID, providerResponse]);
}
