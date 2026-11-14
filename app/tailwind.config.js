/** @type {import('tailwindcss').Config} */
// Every color, font size, radius and shadow utility resolves to a --jz-* variable declared in
// ../design/tokens.css. The default Tailwind palette, type scale, radii and shadows are replaced,
// not extended, so a class outside the token set produces no CSS.
const c = (name) => `rgb(var(--jz-${name}) / <alpha-value>)`;
const size = (name) => [`var(--jz-text-${name})`, { lineHeight: `var(--jz-leading-${name})` }];

module.exports = {
  darkMode: 'class',
  // The dev gallery is scanned only outside production builds, so its classes never reach the shipped CSS.
  content: ['./index.html', './src/**/*.{ts,tsx}', ...(process.env.NODE_ENV === 'production' ? [] : ['./dev/**/*.{html,tsx}'])],
  theme: {
    // Ascending order matters for the cascade. tablet / table / desktop / wide are the design-system breakpoints
    // (mirrored in src/components/ui/useMediaQuery.ts); sm / md / lg / xl / 2xl are Tailwind's defaults, still used by pages.
    screens: { sm: '640px', tablet: '761px', md: '768px', table: '900px', lg: '1024px', xl: '1280px', desktop: '1280px', '2xl': '1536px', wide: '1680px' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      jz: {
        canvas: c('canvas'),
        surface: c('surface'),
        'surface-2': c('surface-2'),
        ink: c('ink'),
        'ink-2': c('ink-2'),
        muted: c('muted'),
        border: c('border'),
        'border-strong': c('border-strong'),
        brand: c('brand'),
        'brand-soft': c('brand-soft'),
        'on-brand': c('on-brand'),
        teal: c('teal'),
        amber: c('amber'),
        orange: c('orange'),
        red: c('red'),
        'on-red': c('on-red'),
        scrim: c('scrim'),
        sev: {
          critical: c('sev-critical'),
          high: c('sev-high'),
          medium: c('sev-medium'),
          low: c('sev-low'),
          info: c('sev-info'),
        },
      },
    },
    fontFamily: {
      sans: ['var(--jz-font-body)'],
      display: ['var(--jz-font-display)'],
      mono: ['var(--jz-font-mono)'],
    },
    fontSize: {
      meta: size('meta'),
      label: size('label'),
      body: size('body'),
      section: size('section'),
      title: size('title'),
      page: size('page'),
      metric: size('metric'),
      display: size('display'),
    },
    fontWeight: {
      normal: 'var(--jz-weight-regular)',
      medium: 'var(--jz-weight-medium)',
      semibold: 'var(--jz-weight-strong)',
    },
    borderRadius: {
      none: '0',
      tag: 'var(--jz-radius-tag)',
      control: 'var(--jz-radius-control)',
      card: 'var(--jz-radius-card)',
      panel: 'var(--jz-radius-panel)',
      dialog: 'var(--jz-radius-dialog)',
      pill: 'var(--jz-radius-pill)',
    },
    boxShadow: {
      none: 'none',
      card: 'var(--jz-shadow-card)',
      dialog: 'var(--jz-shadow-dialog)',
    },
    extend: {
      // Text utilities use the AA-safe ink variants; fills and dots keep the base hue.
      textColor: { jz: { teal: c('teal-ink'), amber: c('amber-ink') } },
      spacing: {
        'jz-page': 'var(--jz-page-pad)',
        'jz-sidebar': 'var(--jz-sidebar-w)',
        'jz-sidebar-collapsed': 'var(--jz-sidebar-w-collapsed)',
        'jz-topbar': 'var(--jz-topbar-h)',
        'jz-control': 'var(--jz-control-h)',
        'jz-control-lg': 'var(--jz-control-h-lg)',
        'jz-touch': 'var(--jz-touch-min)',
        'jz-row': 'var(--jz-row-h)',
        'jz-row-lg': 'var(--jz-row-h-lg)',
        'jz-table-head': 'var(--jz-table-head-h)',
      },
      maxWidth: {
        'jz-content': 'var(--jz-content-max)',
        'jz-prose': 'var(--jz-prose-max)',
        'jz-dialog': 'var(--jz-dialog-max)',
      },
      transitionDuration: {
        hover: 'var(--jz-motion-hover)',
        expand: 'var(--jz-motion-expand)',
        page: 'var(--jz-motion-page)',
      },
      transitionTimingFunction: { jz: 'var(--jz-ease)' },
      letterSpacing: { display: 'var(--jz-tracking-display)', page: 'var(--jz-tracking-page)' },
    },
  },
  plugins: [],
};
