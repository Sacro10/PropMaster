import { ReactNode } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';

interface ThemeCardProps {
  children: ReactNode;
  className?: string;
}

export function ThemeCard({ children, className = '' }: ThemeCardProps) {
  const { isDark, border } = useThemeStyles();
  
  return (
    <div 
      className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
