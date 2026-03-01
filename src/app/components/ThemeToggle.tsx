import { Sun, Moon } from 'lucide-react'
import { useThemeContext } from '../context/ThemeContext'

type Theme = 'light' | 'dark'

interface ThemeToggleProps {
  theme?: Theme
  onToggle?: () => void
  variant?: 'default' | 'portal'
}

export function ThemeToggle({ theme: explicitTheme, onToggle: explicitToggle, variant = 'default' }: ThemeToggleProps) {
  const { theme: contextTheme, toggleTheme } = useThemeContext()
  const theme = explicitTheme ?? contextTheme
  const onToggle = explicitToggle ?? toggleTheme
  const iconSize = variant === 'portal' ? 'h-6 w-6' : 'h-5 w-5'
  const buttonClass =
    variant === 'portal'
      ? 'relative inline-flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-[#0a1530] text-white transition-colors hover:bg-[#122247] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]/40'
      : `relative inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6b35]/40 ${
          theme === 'dark' ? 'text-white hover:bg-white/5' : 'text-gray-700 hover:bg-black/5'
        }`

  return (
    <button
      type="button"
      onClick={onToggle}
      className={buttonClass}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-pressed={theme === 'dark'}
    >
      <div className={`relative ${iconSize}`}>
        <Sun
          className={`absolute inset-0 h-full w-full transition-all duration-300 ${
            theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
          }`}
        />
        <Moon
          className={`absolute inset-0 h-full w-full transition-all duration-300 ${
            theme === 'light' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
          }`}
        />
      </div>
    </button>
  )
}
