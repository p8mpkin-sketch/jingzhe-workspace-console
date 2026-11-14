# Design System

## 1. Design principles

```text
Calm before decorative
Hierarchy before color
Density with air
One accent per surface
System feedback over animation
```

## 2. Brand direction

The product should feel like a serious editorial operations tool, not a sci-fi dashboard.

```text
Warm neutral canvas
Graphite ink
Indigo primary
Teal health
Amber attention
Restrained red
Fine borders
Soft elevation
```

## 3. Typography

| Role | Family | Weight | Size | Line height |
|---|---|---|---|---|
| Display | Instrument Sans / Noto Sans SC | 600 | 32–40 | 1.1 |
| Page title | Instrument Sans / Noto Sans SC | 600 | 26–30 | 1.2 |
| Section title | Inter / Noto Sans SC | 600 | 16–18 | 1.35 |
| Body | Inter / Noto Sans SC | 400 | 14 | 1.6 |
| UI label | Inter / Noto Sans SC | 500 | 12–13 | 1.4 |
| Metadata | Inter / Noto Sans SC | 400 | 12 | 1.45 |
| Mono / ID | IBM Plex Mono | 400 | 12 | 1.5 |

Rules:

- No letter-spacing on Chinese text.
- Use mono only for IDs, hashes, package names, timestamps, and code.
- Do not use uppercase English labels as a decorative layer everywhere.
- Maximum three weights on one screen.

## 4. Color

### Light

```text
canvas        #F5F6F8
surface       #FFFFFF
surface-2     #F0F2F5
ink           #16181D
ink-2         #434A56
muted         #6B7280
border        #E3E6EB
brand         #3657D6
brand-soft    #E9EDFF
teal          #0E8F7E
amber         #B26A00
red           #B42318
```

### Dark

```text
canvas        #0E1116
surface       #151A21
surface-2     #1B222C
ink           #F2F4F7
ink-2         #C4CBD6
muted         #8B95A5
border        #28313D
brand         #8EA2FF
brand-soft    #1B254A
teal          #4FD1C5
amber         #F5B84B
red           #FF8A80
```

Rules:

- Accent is for action and state, not large backgrounds.
- Never use pure black or pure white as the page canvas.
- Destructive red is reserved for blocking errors and destructive actions.
- No neon glow. No multi-stop rainbow gradients.

## 5. Background

- Base: flat canvas.
- Section: surface card on canvas.
- Emphasis: one soft radial tint behind the page header, max 8% opacity.
- No grid, no scanlines, no circuit patterns, no animated mesh.
- Optional subtle noise at 2–3% opacity for large empty areas, never behind text.

## 6. Spacing and layout

```text
4 px   micro
8 px   control gap
12 px  compact stack
16 px  card padding
24 px  section gap
32 px  page block gap
48 px  major break
```

Page shell:

```text
Padding: 24 desktop / 16 tablet / 12 mobile
Max content: 1680px, centered only above 1680
Grid: 12 columns; 24px gutter desktop, 16px tablet
```

## 7. Radii and elevation

```text
control  8
card     12
panel    16
dialog   20
pill     999
```

Shadows:

```text
card:   0 1px 2px rgba(16,24,40,.04), 0 8px 24px -18px rgba(16,24,40,.18)
dialog: 0 20px 60px -24px rgba(16,24,40,.30)
```

No glow shadow.

## 8. Components

### Button

- primary: brand fill, white text, 36/40px height.
- secondary: surface + border.
- ghost: transparent until hover.
- danger: red text/border; fill only on confirm.
- one primary per section.

### Input / select

- 36–40px height, 8px radius.
- label above, helper/error below.
- focus: 2px brand ring with 2px offset.

### Card

- only for a distinct object or a grouped action.
- title + optional description + action.
- do not place a form card next to a list card of unrelated height.

### Table

- header 36px, body row 44–52px.
- hover surface-2.
- numeric columns right-aligned, tabular numerals.
- sticky header, pagination footer.
- below 900px convert to record cards.

### Tabs

- text + count; underline indicator.
- no pill tabs for primary navigation.

### Metric

- label 12, value 28–32, hint 12.
- no icon unless it adds meaning.
- no decorative gradients behind numbers.

### Status

```text
success: dot + label
attention: dot + label
danger: dot + label
neutral: dot + label
```

Always use both color and text.

## 9. Iconography

Lucide, 16/18px, 1.75 stroke. One icon per action. No icon-only controls without tooltip.

## 10. Motion

```text
hover: 120 ms
expand/collapse: 180 ms
page transition: 220 ms
```

Honor `prefers-reduced-motion`.

## 11. Accessibility

- 4.5:1 text contrast.
- Visible focus on every control.
- Dialog focus trap and Escape close.
- Table headers are semantic.
- Do not rely on color alone for status.
- Touch targets >= 40px desktop, 44px mobile.
