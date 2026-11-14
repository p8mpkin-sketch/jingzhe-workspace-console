# UX and Visual Audit

## Diagnosis

The current frontend is functional but feels like a collection of feature panels rather than one product.

### 1. Fixed-width pages on wide monitors

Several pages are capped at a narrow content width. On 1512–2410 px monitors this produces large empty gutters and makes the app look unfinished.

Target: full workspace width with an optional readable max for prose only.

### 2. Card-first information architecture

Cards are used for metrics, navigation, filters, and data. Too many surfaces have the same weight, so nothing reads as primary.

Target:
- one primary action per page;
- one primary metric per row;
- tables for comparison;
- cards only for distinct objects or grouped actions.

### 3. Mismatched column heights

Two-column page layouts often pair a short form card with a long history list, leaving a large empty block under the short column.

Target: avoid side-by-side cards with unrelated heights. Use full-width stacked sections or equal-height grids with a defined minimum.

### 4. Two visual languages

Dark surfaces, neon accents, glow effects, and small uppercase labels sit beside standard product UI patterns.

Target: one editorial operations language. Quiet surfaces, strong typography, purposeful accent.

### 5. Status vocabulary is inconsistent

The same state may appear as an English machine value, a Chinese label, or a colored dot in different pages.

Target: canonical state dictionary in `design/tokens.json`; all UI reads from it.

### 6. Typography lacks hierarchy

Page titles, section titles, table headers, metadata, and buttons frequently use similar sizes and weights. Small grey text is overused.

Target: 5-step type scale, 3 weights, higher contrast for secondary text.

### 7. Whitespace is accidental, not composed

Large empty gaps appear below short content; headers and tables have unrelated vertical rhythms.

Target: 8px spacing grid; page sections at 24/32/48; no unstyled growth.

### 8. Tables are inconsistent

Row heights, hover states, header backgrounds, and pagination placement vary by page.

Target: one table primitive with density modes and a shared pagination footer.

### 9. Mobile is an afterthought

Wide tables require horizontal scrolling, side panels become cramped, and action groups wrap poorly.

Target: responsive rules per component; table → stacked record cards below 900px; toolbar wraps into two rows.

### 10. Motion is decorative

Breathing borders and glow animations compete with status information.

Target: 120–220 ms transitions for state changes only; honor reduced motion.

### 11. Empty states are dead ends

Several pages show only “no data”.

Target: empty state with cause, next action, and one relevant shortcut.

### 12. Accessibility

Low-contrast metadata, small click targets, and focus styles need systematic review.

Target: 4.5:1 text contrast, 44px touch targets on mobile, visible focus ring, keyboard path for every dialog.
