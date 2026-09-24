import type { LucideIcon } from 'lucide-react'

interface SettingsSectionProps {
  icon: LucideIcon
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}

export function SettingsSection({
  icon: Icon,
  title,
  badge,
  children,
}: SettingsSectionProps) {
  return (
    <div className="p-3 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {title}
          </span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}
