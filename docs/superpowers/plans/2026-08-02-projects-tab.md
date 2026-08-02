# Projects Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Projects tab that lists saved workspace projects.

**Architecture:** A new lazy-loaded `ProjectsPage` reads the existing workspace registry through `workspaceApi.list()`. The existing route, shell, and sidebar patterns expose it at `/projects`; no backend behavior changes.

**Tech Stack:** React, TanStack Router, Tailwind CSS, Playwright.

## Global Constraints

- Reuse `workspaceApi.list()`; do not add API endpoints or dependencies.
- Keep the page read-only: no create, switch, edit, or remove controls.
- Preserve unrelated working-tree changes.

---

### Task 1: Cover Projects navigation

**Files:**
- Modify: `ui/e2e/navigation.spec.ts:15-40`

**Interfaces:**
- Consumes: the sidebar navigation item labelled `Projects`.
- Produces: an end-to-end assertion that `/projects` is reachable and renders the Projects heading.

- [ ] **Step 1: Write the failing test**

Add this step to `sidebar navigates between pages` after the Docs step:

```ts
await test.step("Navigate to Projects via sidebar", async () => {
  await page.getByText("Projects", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx playwright test e2e/navigation.spec.ts -g "sidebar navigates between pages"`

Expected: FAIL because the sidebar has no Projects item.

- [ ] **Step 3: Implement the minimal page and navigation**

Create `ui/src/pages/ProjectsPage.tsx` with a default React component that fetches `workspaceApi.list()` on mount and renders a `PageShell`, `PageHeader`, and `PageContent`. Render each project’s `name`, `path`, `id`, and `lastUsed`; render loading, empty, and inline-error states.

Update:

```ts
// ui/src/components/organisms/AppSidebar.tsx
{ id: "projects", label: "Projects", icon: FolderOpen, to: "/projects" },

// ui/src/router.tsx
const projectsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/projects", component: EmptyRoute });

// ui/src/AppShell.tsx
const ProjectsPage = lazyWithRetry(() => import("./pages/ProjectsPage"));
// Add `projects: "Projects"` to titles, return "projects" from getCurrentPage(),
// and render <ProjectsPage /> in renderPage().
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx playwright test e2e/navigation.spec.ts -g "sidebar navigates between pages"`

Expected: PASS, with the Projects sidebar link reaching `/projects` and displaying its heading.

- [ ] **Step 5: Build the frontend**

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add ui/e2e/navigation.spec.ts ui/src/components/organisms/AppSidebar.tsx ui/src/router.tsx ui/src/AppShell.tsx ui/src/pages/ProjectsPage.tsx
git commit -m "feat: add projects tab"
```
