import { useThemeContext } from '../context/ThemeContext';

export function useThemeStyles() {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  return {
    isDark,
    // Background and text colors
    bg: {
      primary: isDark ? 'bg-[#0a0e1a]' : 'bg-white',
      secondary: isDark ? 'bg-[#0f1523]' : 'bg-gray-50',
      card: isDark ? 'bg-[#0f1523]/60' : 'bg-white',
      hover: isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100',
      active: isDark ? 'bg-white/10' : 'bg-gray-200',
    },
    text: {
      primary: isDark ? 'text-white' : 'text-gray-900',
      secondary: isDark ? 'text-white/70' : 'text-gray-600',
      muted: isDark ? 'text-white/50' : 'text-gray-500',
      inactive: isDark ? 'text-white/40' : 'text-gray-400',
    },
    border: {
      default: isDark ? 'border-white/10' : 'border-gray-200',
      hover: isDark ? 'border-white/20' : 'border-gray-300',
    },
    // Helper function for conditional classes
    cn: (...classes: (string | boolean | undefined)[]) => 
      classes.filter(Boolean).join(' '),
  };
}
