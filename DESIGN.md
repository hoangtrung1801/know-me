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

# Landing

This section applies only to `landing/`; the workspace system above remains independent. Source: `landing/src/index.css`, `landing/src/App.tsx`, and `landing/index.html`.

## Overview

The user-pinned Resurf.so reference establishes a quiet pale gray canvas, centered serif headlines, compact navigation, restrained black actions, real product screenshots, and soft feature tiles. The implemented page moves from the hero and screenshot carousel through features, a product tour, the local/AI story, FAQ, and installation.

## Colors

Canvas `#f8f8f8`; foreground `#242321`; muted text `--muted: #686963`; separators `--border: #e2e2df`; selective accent `--accent: #176b60`. Primary actions use `#22211f` with white text, changing to `#41413c` on hover. Secondary actions use `#eaeae8`, changing to `#dddedb`. Feature tiles use `#efefed`, miniature interfaces white, the terminal `#eceeea`, and the install command `#eaece7`. Teal marks focus, selected screenshots, and small product cues.

## Typography

Google Fonts supplies Libre Caslon Display (400) and Inter (400, 500, 600) through the stylesheet in `landing/index.html`. Display fallbacks are Georgia/serif; body fallbacks are the platform system sans stack. H1 is 58px and H2 46px, both 400 weight, 1.08 line height, and `-0.025em` tracking. Hero body is 16px; feature titles 15px/500 and descriptions 13px/1.55; navigation 13px; captions 13px. Paragraphs generally use 1.6 line height. CLI examples use the browser monospace font.

## Layout

Content is centered at `min(960px, calc(100% - 48px))`; the header is 66px high. Hero padding is `100px 24px 67px`, with a 590px body measure. Features form three columns with 9px gaps; the local/AI story uses two columns with a 55px gap. Major sections have approximately 110–126px of vertical separation; FAQ is capped at 680px.

At ≤760px, content has 16px side gutters, H1/H2 become 44px/36px, features use two columns, section separation reduces to 80px, and the footer wraps. At ≤520px, H1 becomes 42px with an explicit line break; navigation becomes a toggleable panel, thumbnails become three columns, carousel controls shrink to 31px, the story stacks, and controls/type become more compact. Feature tiles retain two columns. At ≥1500px, hero top padding becomes 115px.

## Elevation & Depth

Depth is reserved for product imagery and small interface illustrations. The main screenshot uses `0 23px 55px -15px #24232130`; the tour uses `0 20px 45px -25px #0004`. Feature tiles remain flat, with tonal separation; miniature cards have restrained shadows.

## Shapes

Buttons and tabs use 7px corners; install commands 8px; miniature cards 12px; tour and terminal 13px; the main screenshot 15px; feature tiles 16px. Carousel arrows are circular. Screenshot media retains a 1.6 aspect ratio and uses `object-fit: contain` in the main views.

## Components

- Buttons use 14px/500 type and `13px 23px` padding; header actions are smaller. Focus-visible links, buttons, and FAQ summaries use a 2px teal outline with 5px offset.
- The carousel provides previous/next arrows, six selectable screenshot thumbnails, and a live caption. The independent tour selects Kanban, Documents, Graph, or Chat with compact filled active tabs. Neither view auto-advances.
- Feature tiles combine quiet miniature interface illustrations with left-aligned titles and descriptions.
- FAQ uses native `details`/`summary`, divider lines, and a plus that rotates when open. Installation provides a selectable command, copy button, and live copied/error feedback.
- State transitions are brief (`0.18s` button background); reduced motion disables transitions and smooth scrolling.

## Do's and Don'ts

- Do preserve the centered serif hierarchy, pale canvas, restrained actions, generous section rhythm, and real product imagery.
- Do keep secondary labels legible at `#686963`; the finish review corrected the lighter labels to this value.
- Do retain visible focus, native FAQ controls, and reduced-motion support.
- Don't apply the workspace's teal primary buttons or dark theme to this landing surface without an explicit redesign.
- Don't replace the product screenshots with invented product mockups. Existing repository images were copied to `landing/public/screenshots/` with embedded origin metadata; the existing logo remains in use.
