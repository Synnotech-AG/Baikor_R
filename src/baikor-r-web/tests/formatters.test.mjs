import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTimestamp } from '../src/shared/formatters.ts'

test('timestamps include the full localized date and time down to seconds', () => {
  const timestamp = '2026-10-01T12:34:56'
  assert.equal(formatTimestamp(timestamp), '01.10.2026, 12:34:56')
  assert.equal(formatTimestamp(timestamp, 'en-GB'), '01/10/2026, 12:34:56')
})

test('timestamps represent equivalent instants consistently across source offsets', () => {
  assert.equal(
    formatTimestamp('2026-10-01T12:34:56+02:00'),
    formatTimestamp('2026-10-01T10:34:56Z'),
  )
})
