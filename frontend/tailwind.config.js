/* ============================================================
   ARIXGEAR.TECH — storefront Tailwind theme (Phase 1 rebuild)
   Tokens are space-separated RGB channels in src/index.css
   (`:root` = dark · `html.light` overrides). Fallback values
   below mirror the DARK palette so first paint is always right.
   ============================================================ */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:     'rgb(var(--c-bg-rgb, 11 15 20) / <alpha-value>)',
        bg2:    'rgb(var(--c-bg2-rgb, 14 20 27) / <alpha-value>)',
        panel:  'rgb(var(--c-panel-rgb, 16 22 29) / <alpha-value>)',
        panel2: 'rgb(var(--c-panel2-rgb, 20 28 36) / <alpha-value>)',
        line:   'rgb(var(--c-line-rgb, 27 36 48) / <alpha-value>)',
        line2:  'rgb(var(--c-line2-rgb, 38 50 64) / <alpha-value>)',
        txt:    'rgb(var(--c-txt-rgb, 230 237 243) / <alpha-value>)',
        muted:  'rgb(var(--c-muted-rgb, 139 152 165) / <alpha-value>)',
        dim:    'rgb(var(--c-dim-rgb, 93 107 122) / <alpha-value>)',
        silver: 'rgb(var(--c-silver-rgb, 169 180 192) / <alpha-value>)',
        silver2: '#7C8B9A',
        acc:    'rgb(var(--c-acc-rgb, 47 129 247) / <alpha-value>)',
        acc2:   'rgb(var(--c-acc2-rgb, 34 211 238) / <alpha-value>)',
        ok:     'rgb(var(--c-ok-rgb, 63 185 80) / <alpha-value>)',
        red:    'rgb(var(--c-red-rgb, 248 81 73) / <alpha-value>)',
        amber:  'rgb(var(--c-amber-rgb, 210 153 34) / <alpha-value>)',
      },
      fontFamily: {
        disp: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Arial Black', 'sans-serif'],
        head: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Helvetica Neue', 'sans-serif'],
        cond: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Arial Narrow', 'sans-serif'],
        body: ['"Space Grotesk"', '"Noto Sans Bengali"', 'Inter', 'Helvetica Neue', 'sans-serif'],
      },
      transitionTimingFunction: {
        forge: 'cubic-bezier(.2,.7,.3,1)',
        snap: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        marquee:  { '0%': { transform: 'translate(0)' }, '100%': { transform: 'translate(-50%)' } },
        bump:     { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        heroIn:   { '0%': { opacity: 0, transform: 'translateY(24px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        slideUp:  { '0%': { opacity: 0, transform: 'translateY(14px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        popIn:    { '0%': { opacity: 0, transform: 'translateY(8px) scale(.98)' }, '100%': { opacity: 1, transform: 'translateY(0) scale(1)' } },
        fadeIn:   { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        draw:     { to: { strokeDashoffset: 0 } },
        shake:    { '10%,90%': { transform: 'translate(-1px)' }, '20%,80%': { transform: 'translate(2px)' }, '30%,50%,70%': { transform: 'translate(-3px)' }, '40%,60%': { transform: 'translate(3px)' } },
        ctaPulse: { '0%,100%': { filter: 'drop-shadow(0 0 0 rgba(47,129,247,0))' }, '50%': { filter: 'drop-shadow(0 0 16px rgba(47,129,247,.55))' } },
      },
      animation: {
        marquee: 'marquee 22s linear infinite',
        bump: 'bump .5s ease',
        heroIn: 'heroIn .7s cubic-bezier(.2,.7,.3,1) both',
        slideUp: 'slideUp .5s cubic-bezier(.2,.7,.3,1) both',
        popIn: 'popIn .35s cubic-bezier(.2,.7,.3,1) both',
        fadeIn: 'fadeIn .4s ease both',
        draw: 'draw .7s .2s ease forwards',
        shake: 'shake .5s ease',
        pulse: 'ctaPulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
