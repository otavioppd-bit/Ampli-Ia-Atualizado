/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: {
          900: '#0b1120',
          800: '#111827',
          700: '#1e293b',
          600: '#334155',
        },
        glass: {
          DEFAULT: 'rgba(17,24,39,0.75)',
          light: 'rgba(30,41,59,0.4)',
          border: 'rgba(255,255,255,0.05)',
          hover: 'rgba(255,255,255,0.08)',
        },
        amber: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        mood: {
          stress: '#ef4444',
          sad: '#a855f7',
          focus: '#10b981',
          anxiety: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.4)',
        'glass-sm': '0 4px 16px rgba(0,0,0,0.3)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.5)',
        glow: '0 0 24px rgba(245,158,11,0.15)',
        'glow-sm': '0 0 12px rgba(245,158,11,0.1)',
        'glow-lg': '0 0 40px rgba(245,158,11,0.2)',
        inner: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        'inner-lg': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      backdropBlur: {
        glass: '24px',
        heavy: '48px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        'fade-down': 'fadeDown 0.3s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'scale-out': 'scaleOut 0.2s ease-in',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'pulse-red': 'pulseRed 1.5s ease-in-out infinite',
        breathe: 'breathe 4s ease-in-out infinite',
        flame: 'flame 0.6s ease-in-out infinite alternate',
        shimmer: 'shimmer 2.5s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'progress': 'progress 1s ease-out forwards',
        stroke: 'stroke 1.5s cubic-bezier(0.16,1,0.3,1) forwards',
        // Erro no quiz: sacode curto, sem deslocar o layout (so transform).
        shake: 'shake 0.4s cubic-bezier(0.36,0.07,0.19,0.97)',
        // "+10 XP" subindo e sumindo ao concluir uma tarefa.
        'fade-up-out': 'fadeUpOut 1s cubic-bezier(0.16,1,0.3,1) forwards',
        // Bottom sheet do menu "Mais".
        'sheet-up': 'sheetUp 0.3s cubic-bezier(0.16,1,0.3,1)',
        // Brilho percorrendo o skeleton enquanto carrega.
        'skeleton': 'skeleton 1.2s ease-in-out infinite',
        // Idle do mascote nos estados vazios: so translateY, sem tocar
        // em layout. 4px e o suficiente para dar vida sem distrair.
        'float-suave': 'floatSuave 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeDown: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(8px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        scaleOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.92)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.3)' },
          '50%': { boxShadow: '0 0 0 16px rgba(239,68,68,0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        flame: {
          '0%': { transform: 'scale(1) rotate(-2deg)', filter: 'brightness(1)' },
          '100%': { transform: 'scale(1.12) rotate(2deg)', filter: 'brightness(1.2)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        progress: {
          '0%': { width: '0%' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(5px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(2px)' },
        },
        fadeUpOut: {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.9)' },
          '25%': { opacity: '1', transform: 'translateY(-6px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-34px) scale(1)' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        skeleton: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.8' },
        },
        floatSuave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'amber-glow': 'radial-gradient(ellipse at center, rgba(245,158,11,0.08) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
}
