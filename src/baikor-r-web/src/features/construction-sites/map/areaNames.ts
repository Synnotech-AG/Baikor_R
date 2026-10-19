const areaNamePattern = /^Area\s+(\d+)$/i

export function compareAreaNames(left: string, right: string) {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' })
}

export function getNextAreaNumber(names: string[]) {
  return names.reduce((maximum, name) => {
    const match = areaNamePattern.exec(name)
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, 0) + 1
}
