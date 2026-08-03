# Bottom Navigation Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present desktop navigation as a compact floating bottom dock without changing routes or mobile navigation.

**Architecture:** `AppSidebar` retains its route definitions and router links, but uses a desktop dock layout with the existing tooltip primitive. Mobile continues through the existing sidebar sheet. A focused Playwright assertion captures the dock's presence and route navigation.

**Tech Stack:** React, TanStack Router, Tailwind CSS, Lucide, Playwright.

## Global Constraints

- Reuse existing dependencies and routes; add no packages or navigation state.
- Do not overwrite the current uncommitted UI changes outside this feature.

---

### Task 1: Desktop bottom navigation dock

**Files:**
- Modify: `ui/src/components/organisms/AppSidebar.tsx`
- Modify: `ui/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes: `topNavItems`, `useConfig`, `useIsMobile`, and TanStack `Link` already in `AppSidebar`.
- Produces: a desktop element with `data-navigation-dock`, icon links with accessible labels/tooltips, and an active route style.

- [ ] **Step 1: Write the failing test**

```ts
test("desktop navigation uses the bottom dock", async ({ page }) => {
  await page.goto(server.baseURL);
  await expect(page.locator("[data-navigation-dock]")).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/tasks/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- navigation.spec.ts --grep "bottom dock"`

Expected: FAIL because `[data-navigation-dock]` does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
<nav aria-label="Main navigation" data-navigation-dock className="fixed bottom-4 left-1/2 -translate-x-1/2">
  {/* existing icon links and existing tooltip support */}
</nav>
```

Render this for desktop only; preserve the current sidebar sheet for mobile. Keep every existing route and Settings visible as icon buttons.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `npm run test:e2e -- navigation.spec.ts --grep "bottom dock"`

Expected: PASS.

- [ ] **Step 5: Run build verification**

Run: `npm run build`

Expected: exit code 0.
