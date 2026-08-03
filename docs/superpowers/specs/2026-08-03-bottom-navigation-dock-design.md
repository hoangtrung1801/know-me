# Bottom Navigation Dock Design

## Goal

Replace the persistent desktop sidebar with a compact floating dock centered at the bottom of the viewport.

## Behavior

- Render the existing visible navigation routes as icon buttons in the dock.
- Show each destination name through the existing accessible tooltip on hover and keyboard focus.
- Keep the active route visually selected.
- Keep every existing destination, including Settings, in the dock.
- Preserve the current mobile navigation sheet and all routes, search shortcut, and workspace actions.

## Implementation

Update `AppSidebar.tsx` to render the dock on desktop while retaining its existing mobile sidebar. Keep `AppShell.tsx`'s sidebar provider and trigger so existing keyboard and mobile behavior continue to work. Extend the navigation end-to-end Playwright test to assert a dock navigation route.

## Constraints

- Reuse existing Lucide icons, sidebar tooltip support, router links, and UI primitives.
- Add no dependencies or new navigation state.
