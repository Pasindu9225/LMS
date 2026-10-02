# A/L LMS — UI redesign: "Mono precision", dark/light themes, system-wide language (Design)

**Date:** 2026-10-02 · Visual direction chosen in the brainstorming companion: **F2 · Mono precision** (near-monochrome, one electric-lime accent, hairline borders, monospace details).

## Goal
- One clean, minimal, slightly futuristic look across every page (student, staff, auth).
- A **language selector** (සිං / EN) and a **theme switch** (system / dark / light) on every page, including before login.
- No behaviour or data changes.

**Success:**
- Every page renders in the chosen language from the first paint, with no mixed "සිංහල / English" labels.
- Dark and light themes both meet 4.5:1 text contrast, and there is no theme flash on load.
- Layouts work at 375 / 768 / 1024 / 1440 px.
- All existing tests stay green.

## Theme
- Cookie `theme` = `light` | `dark` | `system` (default `system`). The server sets `data-theme` on `<html>` only for explicit choices.
- CSS tokens on `:root` (light), overridden by `[data-theme=dark]` and by `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) }`. System mode needs no script and follows device changes live.
- Tailwind 4 `@theme inline` maps the tokens to utilities: `bg`, `surface`, `surface-2`, `fg`, `muted`, `subtle`, `border`, `border-strong`, `primary`/`primary-fg`, `accent`, `accent-soft`, `accent-line`, `danger`(+soft), `warn`(+soft).
  - Light: primary is near-black, the accent is a dark lime (text-safe).
  - Dark: primary is lime #a3e635, the accent is #bef264.
- Pages use only these tokens, never raw palette classes.

## Language
- Cookie `lang` = `si` (default) | `en`; read by the server (`getPrefs()` in `lib/prefs.ts`) and shared with client components through a small context (`PrefsProvider`, `useT()`).
- Changing language or theme is a server action that sets the cookie and refreshes.
- Migration: an existing chat `localStorage.lang` is copied to the cookie once, if no cookie is set.
- `lib/i18n.ts`: one dictionary object per language, grouped by area (common, auth, chat, learn, quiz, classes, staff). `en` must have exactly `si`'s shape (TypeScript `satisfies` plus a unit test on the key sets).
- The tutor still replies in the language of the question; quizzes use the selected language.

## Fonts
`next/font/google`, self-hosted: **Inter** (Latin), **Noto Sans Sinhala** (Sinhala), **JetBrains Mono** (labels, numbers, codes, citations). Stack: `Inter, Noto Sans Sinhala, system-ui`.

## Components — `app/ui/`
`Button` (primary / secondary / ghost / danger; ≥44px tap height on mobile), `Input`, `Textarea`, `Select`, `Field` (visible label + hint/error), `Card`, `Badge` (neutral / ok / warn / danger), `PageHeader` (title, description, actions), `Icon` (inline Lucide-style SVGs, `aria-hidden`), `LangSwitch`, `ThemeSwitch`, `NavLink` (active state). Focus rings visible; motion ≤ 200ms and off under `prefers-reduced-motion`.

## Layouts
- **Student** (`app/(student)/layout.tsx`, a route group, so URLs are unchanged: `/chat`, `/learn…`, `/classes`):
  - Top bar: brand, Tutor / Lessons / Classes, LangSwitch, ThemeSwitch, account menu (name, Staff area link for staff, Log out).
  - Phones: the three links move to a bottom tab bar.
  - Chat fills the remaining height.
- **Staff** (`app/admin/layout.tsx`): a left sidebar in groups (Content: Documents, Lessons, Subjects · Students: Flags with an open count, Classes, Chat logs · Admin: Users); admin-only items are hidden for teachers. It becomes a menu on phones. Each page has a `PageHeader` with one primary action; tables use mono numbers and status badges.
- **Auth** (`/login`, `/signup`): a centred single column with visible labels; switches top-right.
- A `not-found` page in the same style.

## Pages restyled
login, signup, chat, learn (index, subject, lesson, quiz), classes; admin documents (+ review), subjects, lessons (list, new, edit), classes (list, detail), flags, logs, users. Quiz results label "correct" / "your answer" in text, not colour only.

## Testing
- Unit: the i18n key-shape test.
- Existing suite, typecheck, lint, build.
- Browser pass with the e2e accounts: each page in both themes and both languages at 375 px and 1280 px (screenshots checked), plus no console errors or hydration warnings.

## Out of scope
New features, Tamil, user-chosen accent colours, charts/dashboards.
