/* ============================================================
   ARIXGEAR.TECH — admin panel Tailwind theme (Phase 1 rebuild)
   Tokens live in src/index.css as `--c-*` channels
   (`:root`/`[data-theme=dark]` · `[data-theme=light]`).
   ============================================================ */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'rgb(var(--c-bg) / <alpha-value>)',
        panel:   'rgb(var(--c-panel) / <alpha-value>)',
        panel2:  'rgb(var(--c-panel2) / <alpha-value>)',
        line:    'rgb(var(--c-line) / <alpha-value>)',
        line2:   'rgb(var(--c-line2) / <alpha-value>)',
        txt:     'rgb(var(--c-txt) / <alpha-value>)',
        dim:     'rgb(var(--c-dim) / <alpha-value>)',
        dim2:    'rgb(var(--c-dim2) / <alpha-value>)',
        acc:     'rgb(var(--c-acc) / <alpha-value>)',
        'acc-hi': 'rgb(var(--c-acc-hi) / <alpha-value>)',
        /* Step 2 audit fixes — previously-missing tokens: `bg-acc-dim` (selected
           states, 22 usages), `orange` (warning chips: paused deals, Nagad,
           AI duplicate warnings — 9 dead classes) */
        /* Step 4 (4.3) ROOT-CAUSE NOTE — do NOT add shade-suffixed classes for
           these colors. In `theme.extend`, a STRING color definition REPLACES
           the matching default Tailwind SCALE at the top-level key: after
           `red: 'rgb(var(--c-red)…)'`, `red-400/500/600` no longer exist, so
           `text-red-500`, `border-red-500/40` … generate ZERO CSS (the exact
           root cause of the storefront's 90 dead classes, fixed in Step 3.4).
           These 7 single-value tokens (red/green/orange/blue/teal/purple/
           yellow) are theme channels that flip with :root/[data-theme=light]
           — always use the shadeless form (`text-red`, `bg-green/10`,
           `border-yellow/40`). Default-palette scales (slate/amber/emerald/
           sky …) still resolve but are THEME-BLIND (same values in both
           modes → unreadable chips in one mode): all such usages were swept
           to tokens (Step 2 + Step 4: last 6 in customers.jsx). */
        'acc-dim': 'rgb(var(--c-acc-dim) / <alpha-value>)',
        orange:  'rgb(var(--c-orange) / <alpha-value>)',
        green:   'rgb(var(--c-green) / <alpha-value>)',
        red:     'rgb(var(--c-red) / <alpha-value>)',
        blue:    'rgb(var(--c-blue) / <alpha-value>)',
        teal:    'rgb(var(--c-teal) / <alpha-value>)',
        purple:  'rgb(var(--c-purple) / <alpha-value>)',
        yellow:  'rgb(var(--c-yellow) / <alpha-value>)',
      },
      fontFamily: {
        disp: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Impact', 'sans-serif'],
        body: ['"Space Grotesk"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
        cond: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Arial Narrow', 'sans-serif'],
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        slideUp:  { '0%': { opacity: 0, transform: 'translateY(14px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        drawerIn: { '0%': { opacity: 0, transform: 'translateX(24px)' }, '100%': { opacity: 1, transform: 'translateX(0)' } },
      },
      animation: {
        slideUp: 'slideUp .3s ease both',
        drawerIn: 'drawerIn .3s ease both',
      },
    },
  },
  plugins: [],
};
