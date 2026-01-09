import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface SettingsSelectProps<T extends string = string> {
  value: T
  onValueChange: (value: T) => void
  options: Array<SelectOption<T>>
  'aria-label'?: string
}

export function SettingsSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
}: SettingsSelectProps<T>) {
  // Handle Base UI's onValueChange signature which includes null
  const handleValueChange = (newValue: T | null) => {
    if (newValue !== null) {
      onValueChange(newValue)
    }
  }

  return (
    <Select value={value} onValueChange={handleValueChange}>
      <SelectTrigger
        className="w-full h-9 rounded-lg bg-muted/60 border-0 focus:ring-2 focus:ring-ring/50"
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
