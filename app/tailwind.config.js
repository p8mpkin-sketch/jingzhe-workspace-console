/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        jz: {
          // R95-UI: 语义 token——CSS 变量承载, index.css :root/.dark 双段定义, 组件零改动双模生效
          bg: 'rgb(var(--c-bg) / <alpha-value>)',
          surface: 'rgb(var(--c-surface) / <alpha-value>)',
          elevated: 'rgb(var(--c-elevated) / <alpha-value>)',
          border: 'rgb(var(--c-border) / <alpha-value>)',
          // R103-1: 聚焦/激活重音 + 规约四色 accent(双模取值见 index.css)
          active: 'rgb(var(--c-border-active) / <alpha-value>)',
          accent: {
            cyan: 'rgb(var(--c-accent-cyan) / <alpha-value>)',
            emerald: 'rgb(var(--c-accent-emerald) / <alpha-value>)',
            amber: 'rgb(var(--c-accent-amber) / <alpha-value>)',
            crimson: 'rgb(var(--c-accent-crimson) / <alpha-value>)',
          },
          text: {
            primary: 'rgb(var(--c-text-primary) / <alpha-value>)',
            secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
            muted: 'rgb(var(--c-text-muted) / <alpha-value>)',
          }
        },
        vuln: {
          critical: '#EF4444',
          high: '#F97316',
          medium: '#F59E0B',
          low: '#06B6D4',
          safe: '#10B981',
        },
        neon: {
          accent: '#6366F1',
          glow: 'rgba(99, 102, 241, 0.25)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'jz-card': 'var(--shadow-card)',
        'neon-glow': '0 0 15px rgba(99, 102, 241, 0.35)',
      },
      animation: {
        breathe: 'breathe 2.4s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { boxShadow: '0 0 6px rgba(16, 185, 129, 0.45)' },
          '50%': { boxShadow: '0 0 14px rgba(16, 185, 129, 0.85)' },
        },
      },
    },
  },
  plugins: [],
};
