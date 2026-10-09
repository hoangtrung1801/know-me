# KnowMe Landing Page

Modern, accessible, local-first landing page for KnowMe.

## Tech Stack
- React 19 + TypeScript
- Vite 7 + Tailwind CSS v4
- Framer Motion + Lenis Smooth Scroll
- Lucide React Icons
- Bun test runner

## Design System
- **Sovereign Deep Teal / Titanium Tokens**:
  - Canvas: `#f8fafc` (`--landing-bg`)
  - Primary Action: `#0d9488` / `#0f766e` (`--landing-primary`)
  - Titanium Headings & Text: `#0f172a` (`--landing-text`)
  - Surfaces: `#ffffff` (`--landing-surface`)
  - Terminal: `#020617` (`--landing-terminal`)
- Accessible typography: System fonts, clear contrast ratios (13:1 on body, 6.3:1 on actions).
- Motion: Respects `prefers-reduced-motion` across all components (BorderBeam, Lenis, ShimmerButton).

## Architecture
Modular component structure:
- `Navbar`: Sticky blurred header with accessible mobile disclosure.
- `Hero`: Clear headline, installation CTA, and instant npm copy snippet.
- `AppleDuoShowcase`: Interactive dual-perspective demonstration (Human workspace vs. CLI stdio core) and real product screenshot gallery (2880x1800 captures).
- `Features`: 6 core capabilities linking to detailed documentation.
- `FAQ`: Native `<details>/<summary>` accordion.
- `InstallCTA`: End-of-page onboarding with step-by-step guidance.
- `Footer`: Clean metadata, navigation, and MIT licensing.

## Commands
```bash
# Run development server
bun run dev

# Run type check
bunx tsc --noEmit

# Run demo engine unit tests
bun test tests

# Build production bundle
bun run build

# Preview production build
bun run preview
```
