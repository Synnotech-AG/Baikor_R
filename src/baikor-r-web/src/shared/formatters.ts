function dateFormatter(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatArea(area: number, locale = 'de-DE') {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(area)} m²`
}

export function formatDate(value: string | null, locale = 'de-DE') {
  if (!value) return '–'
  return dateFormatter(locale).format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value: string, locale = 'de-DE') {
  return dateFormatter(locale).format(new Date(value))
}
