---
name: Know-Me Design System
version: 1.0
---

# Overview

Know-Me is a calm personal workspace for collecting, organizing, and retrieving knowledge. The interface uses a cool mist canvas, white content surfaces, deep teal actions, and compact system typography so everyday work stays focused.

# Colors

Light tokens: `--background #f4f7f7`, `--foreground #202d31`, `--card #ffffff`, `--primary #176b60`, `--secondary #e9efee`, `--muted #eaf0ef`, `--muted-foreground #5c706f`, `--accent #e0eeea`, `--border #dbe4e2`, `--ring #176b60`.

Dark tokens: `--background #141d1e`, `--foreground #e4edea`, `--card #1b2829`, `--primary #8ed6be`, `--secondary #283938`, `--muted #253433`, `--muted-foreground #a1b5b0`, `--accent #2b4540`, `--border #334644`, `--ring #8ed6be`.

Semantic states use success, warning, info, and destructive tokens with soft companion surfaces.

# Typography

Use the system sans stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif). Body text is 1rem with 1.5 line height. Headings use 600 weight and `-0.02em` tracking. Metadata and table content use tabular numerals.

# Layout

The application shell is a full-height flex layout with a persistent sidebar and scrollable content region. The global header is 3.5rem on standard pages and 3rem in chat, with a translucent card surface, subtle bottom border, breadcrumb navigation, and a separated action cluster.

# Elevation & Depth

Prefer borders and surface contrast over heavy shadows. Popovers use `--shadow-popover`; dialogs use `--shadow-dialog`. Overlays use `--overlay`.

# Shapes

The base radius is `0.75rem`; controls use compact medium radii and cards use the shared radius. Pills are reserved for statuses and tags. Focus-visible states use a 2px ring with 3px offset.

# Components

Buttons, inputs, selects, checkboxes, switches, dialogs, sheets, popovers, dropdowns, tables, badges, cards, sidebar navigation, breadcrumbs, theme toggle, and notification controls consume the shared tokens in `ui/src/index.css`. Primary actions use teal, destructive actions use the destructive semantic color, and secondary controls use muted surfaces.

# Do’s and Don’ts

- Do keep navigation and metadata quiet so page content leads.
- Do use semantic colors consistently and preserve keyboard focus visibility.
- Do group related header actions and keep the global bar visually light.
- Don’t introduce one-off colors, radii, or shadows without a system token.
- Don’t use oversized decorative treatment in operational workspace views.
