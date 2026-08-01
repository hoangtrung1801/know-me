# Task Project Scope UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project selection to Task creation and project filtering to the Tasks and Kanban views.

**Architecture:** A small hook loads workspace projects once per mounted view. The task form uses it to submit either a project ID or an explicit global creation request. The list and board filter their already-global task inputs locally and show the same project labels.

**Tech Stack:** React, TypeScript, existing shadcn-style Select and Badge components.

## Global Constraints

- Reuse `workspaceApi.list()` and existing UI components.
- Default list/board scope to All projects.
- Do not add dependencies.

---

### Task 1: Add a reusable project-scope hook

**Files:**
- Create: `ui/src/hooks/useWorkspaceProjects.ts`

**Interfaces:**
- Produces: `useWorkspaceProjects(): { projects: WorkspaceProject[]; loading: boolean }`.

- [ ] **Step 1: Implement the minimal hook**

```ts
export function useWorkspaceProjects() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  useEffect(() => { void workspaceApi.list().then(setProjects).catch(() => setProjects([])); }, []);
  return { projects, loading: false };
}
```

- [ ] **Step 2: Verify the frontend compiles**

Run: `npm run build` from `ui/`

### Task 2: Add project selection to the task form

**Files:**
- Modify: `ui/src/components/organisms/TaskCreateForm.tsx`

**Interfaces:**
- Consumes: `useWorkspaceProjects()`.
- Produces: `createTask({ projectId })` or `createTask({ global: true })`.

- [ ] **Step 1: Add project state and selector**

```tsx
<Select value={projectScope} onValueChange={setProjectScope}>
  <SelectItem value="global">Global</SelectItem>
  {projects.map((project) => <SelectItem value={project.id}>{project.name}</SelectItem>)}
</Select>
```

- [ ] **Step 2: Submit the selected scope**

```ts
projectId: projectScope === "global" ? undefined : projectScope,
global: projectScope === "global",
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `npm run build` from `ui/`

### Task 3: Filter and label Tasks and Kanban

**Files:**
- Modify: `ui/src/pages/TasksPage.tsx`
- Modify: `ui/src/pages/KanbanPage.tsx`
- Modify: the existing task card/list renderers that receive `Task`.

**Interfaces:**
- Consumes: `Task.projectId` and `useWorkspaceProjects()`.
- Produces: All-project default filtering and project labels.

- [ ] **Step 1: Add an All projects selector to each page header**

```tsx
const scopedTasks = projectScope === "all"
  ? tasks
  : tasks.filter((task) => projectScope === "global" ? !task.projectId : task.projectId === projectScope);
```

- [ ] **Step 2: Render compact project badges for scoped and global tasks**

```tsx
<Badge variant="outline">{projectNameByID[task.projectId || ""] || "Global"}</Badge>
```

- [ ] **Step 3: Verify the frontend build**

Run: `npm run build` from `ui/`
