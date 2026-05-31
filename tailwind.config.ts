import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          '50': 'rgb(var(--ink-50) / <alpha-value>)',
          '100': 'rgb(var(--ink-100) / <alpha-value>)',
          '200': 'rgb(var(--ink-200) / <alpha-value>)',
          '300': 'rgb(var(--ink-300) / <alpha-value>)',
          '400': 'rgb(var(--ink-400) / <alpha-value>)',
          '500': 'rgb(var(--ink-500) / <alpha-value>)',
          '600': 'rgb(var(--ink-600) / <alpha-value>)',
          '700': 'rgb(var(--ink-700) / <alpha-value>)',
          '800': 'rgb(var(--ink-800) / <alpha-value>)',
          '900': 'rgb(var(--ink-900) / <alpha-value>)',
          '950': 'rgb(var(--ink-950) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--amber) / <alpha-value>)',
          dim: 'rgb(var(--amber-dim) / <alpha-value>)',
        },
        signal: {
          ok: 'rgb(var(--signal-ok) / <alpha-value>)',
          err: 'rgb(var(--signal-err) / <alpha-value>)',
          warn: 'rgb(var(--signal-warn) / <alpha-value>)',
        },
        accent: {
          blue: 'rgb(var(--accent-blue) / <alpha-value>)',
          purple: 'rgb(var(--accent-purple) / <alpha-value>)',
        },
        border: 'rgb(var(--ink-700) / <alpha-value>)',
        input: 'rgb(var(--ink-700) / <alpha-value>)',
        ring: 'rgb(var(--amber) / <alpha-value>)',
        background: 'rgb(var(--ink-950) / <alpha-value>)',
        foreground: 'rgb(var(--ink-50) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--amber) / <alpha-value>)',
          foreground: 'rgb(var(--ink-950) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--ink-800) / <alpha-value>)',
          foreground: 'rgb(var(--ink-100) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--signal-err) / <alpha-value>)',
          foreground: 'rgb(var(--ink-50) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--ink-800) / <alpha-value>)',
          foreground: 'rgb(var(--ink-400) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--ink-900) / <alpha-value>)',
          foreground: 'rgb(var(--ink-50) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--ink-900) / <alpha-value>)',
          foreground: 'rgb(var(--ink-50) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      fontFamily: {
        mono: ['JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif"', 'IBM Plex Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        'ui-2xs': 'var(--ui-text-2xs)',
        'ui-xs': 'var(--ui-text-xs)',
        'ui-sm': 'var(--ui-text-sm)',
        'ui-base': 'var(--ui-text-base)',
        'ui-lg': 'var(--ui-text-lg)',
      },
      letterSpacing: {
        widest2: '0.18em',
      },
      boxShadow: {
        'inset-hair': 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        'glow-sm': '0 0 6px -1px rgb(var(--amber) / 0.2)',
        glow: '0 0 12px -2px rgb(var(--amber) / 0.25), 0 0 4px 0 rgb(var(--amber) / 0.1)',
        'glow-lg': '0 0 20px -4px rgb(var(--amber) / 0.3), 0 0 8px 0 rgb(var(--amber) / 0.15)',
        lifted: '0 4px 24px -4px rgba(0,0,0,0.4), 0 2px 8px -2px rgba(0,0,0,0.3)',
        float: '0 8px 32px -8px rgba(0,0,0,0.5), 0 4px 12px -4px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'slide-up': 'slide-up 0.3s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      keyframes: {
        'fade-in': {
          from: {
            opacity: '0',
          },
          to: {
            opacity: '1',
          },
        },
        'slide-up': {
          from: {
            opacity: '0',
            transform: 'translateY(8px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'scale-in': {
          from: {
            opacity: '0',
            transform: 'scale(0.97)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
