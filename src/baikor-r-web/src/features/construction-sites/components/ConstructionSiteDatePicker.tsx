import { LocalizedDatePicker } from '../../../shared/LocalizedDatePicker'

interface ConstructionSiteDatePickerProps {
  id: string
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}

export function ConstructionSiteDatePicker({
  id,
  value = '',
  onChange = () => undefined,
  onBlur,
  disabled,
}: ConstructionSiteDatePickerProps) {
  return (
    <LocalizedDatePicker
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  )
}
