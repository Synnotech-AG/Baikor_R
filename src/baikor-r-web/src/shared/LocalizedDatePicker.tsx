import { DatePicker } from 'antd'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

interface LocalizedDatePickerProps {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  invalid?: boolean
  ariaLabel?: string
}

export function LocalizedDatePicker({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  ariaLabel,
}: LocalizedDatePickerProps) {
  const { t } = useTranslation()

  return (
    <DatePicker
      id={id}
      value={value ? dayjs(value, 'YYYY-MM-DD') : null}
      onChange={(date) => onChange(date?.format('YYYY-MM-DD') ?? '')}
      onBlur={onBlur}
      disabled={disabled}
      status={invalid ? 'error' : undefined}
      format="DD.MM.YYYY"
      placeholder={t('date.placeholder')}
      allowClear
      inputReadOnly={false}
      aria-label={ariaLabel}
      getPopupContainer={(trigger) => trigger.closest('.app-shell') ?? document.body}
    />
  )
}
