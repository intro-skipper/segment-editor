import { Label } from '@/components/ui/label'

export interface SettingsFieldProps {
  /** Field label text */
  label: string
  /** Optional id for explicit label-input association */
  htmlFor?: string
  /** Field content (typically an input) */
  children: React.ReactNode
}

export function SettingsField({
  label,
  htmlFor,
  children,
}: SettingsFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
