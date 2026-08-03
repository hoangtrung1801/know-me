# Memo Hashtag Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users filter Memos by whitespace-started hashtag tokens while preserving Markdown headings.

**Architecture:** Keep memo storage and the existing search API unchanged. `MemosPage` derives tags and visible memos from its loaded collection, using the same compact button pattern as Saved Links; the existing browser test covers the interaction.

**Tech Stack:** React 19, TypeScript, Tailwind, Radix Button, Playwright.

## Global Constraints

- Recognize only whitespace-started `#tag` tokens with no whitespace after `#`; `# Heading` remains Markdown.
- Reuse existing UI components; add no dependencies, backend endpoints, or persistence fields.
- Multiple selected tags use OR matching; text search is still applied first by the existing API request.

## File Structure

- Modify `ui/src/pages/MemosPage.tsx`: derive tags from memo content, manage selected tags, and render/restrict the memo list.
- Modify `ui/e2e/memos.spec.ts`: verify a hashtag filter includes matching memos and excludes non-matches.

---

### Task 1: Add client-side memo tag filters

**Files:**
- Modify: `ui/e2e/memos.spec.ts`
- Modify: `ui/src/pages/MemosPage.tsx`

**Interfaces:**
- Consumes: `Memo { id, content, createdAt, updatedAt }` and the existing `Button` component.
- Produces: filter buttons labelled `All tags` and each parsed hashtag; rendered memo groups limited to the selected-tag result.

- [ ] **Step 1: Write the failing browser test**

Append this test to `ui/e2e/memos.spec.ts`:

```ts
test("memos can be filtered by hashtag", async ({ page }) => {
	await page.route("**/api/memos", (route) => route.fulfill({ json: [
		{ id: "memo-work", content: "Ship #work", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "memo-home", content: "Clean #home", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "memo-heading", content: "# Heading", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
	] }));
	await page.goto(`${server.baseURL}/memos`);
	await page.getByRole("button", { name: "work" }).click();
	await expect(page.getByText("Ship #work")).toBeVisible();
	await expect(page.getByText("Clean #home")).not.toBeVisible();
	await expect(page.getByRole("button", { name: "Heading" })).not.toBeVisible();
	await page.getByRole("button", { name: "All tags" }).click();
	await expect(page.getByText("Clean #home")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && bun exec playwright test e2e/memos.spec.ts -g "memos can be filtered by hashtag"`

Expected: FAIL because Memos has no hashtag filter button.

- [ ] **Step 3: Implement the smallest filter flow**

In `ui/src/pages/MemosPage.tsx`:

```ts
const memoTags = (content: string) => [...content.matchAll(/(?:^|\\s)#([\\p{L}\\p{N}_-]+)/gu)].map((match) => match[1]);
```

Import `useMemo`, add `selectedTags` state, then derive sorted unique `availableTags` and `visibleMemos` from `memos`. Use `visibleMemos` for `groupMemos`. Above the memo list, render the existing Saved Links button pattern: `All tags` clears selection, a tag button toggles selection, and a memo is included when it has any selected tag. Use the filter result for the empty state and its count.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `cd ui && bun exec playwright test e2e/memos.spec.ts -g "memos can be filtered by hashtag"`

Expected: PASS.

- [ ] **Step 5: Run the memo browser suite**

Run: `cd ui && bun exec playwright test e2e/memos.spec.ts`

Expected: PASS with no failures.

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/MemosPage.tsx ui/e2e/memos.spec.ts
git commit -m "feat: filter memos by hashtag"
```
