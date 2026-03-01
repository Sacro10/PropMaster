import { Building } from 'lucide-react'

interface PortalBrandProps {
  className?: string
  titleClassName?: string
}

export function PortalBrand({ className = '', titleClassName = '' }: PortalBrandProps) {
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`.trim()}>
      <div className="bg-gradient-to-br from-[#ff6b35] to-[#f7931e] p-3 rounded-xl shrink-0 shadow-[0_8px_24px_rgba(247,147,30,0.25)]">
        <Building className="w-7 h-7 text-white" />
      </div>
      <h1
        className={`text-[2rem] leading-none tracking-wide whitespace-nowrap ${titleClassName}`.trim()}
        style={{ fontFamily: 'Bebas Neue, sans-serif' }}
      >
        PROPMASTER
      </h1>
    </div>
  )
}
