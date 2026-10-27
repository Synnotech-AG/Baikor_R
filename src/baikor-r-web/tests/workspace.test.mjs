import assert from 'node:assert/strict'
import test from 'node:test'
import { filterConstructionSites, toWriteRequest } from '../src/features/construction-sites/workspace.ts'

const base = { status: 'planned', metadata: {}, plannedStart: '2026-10-01', plannedEnd: '2026-10-20' }
const sites = [
  { ...base, id: 'a', title: 'Kanalbau', metadata: { Straße: 'Prüfeninger' } },
  { ...base, id: 'b', title: 'Brücke', status: 'draft', plannedStart: null, plannedEnd: null },
  { ...base, id: 'c', title: 'Leitung', plannedStart: '2026-11-01', plannedEnd: null },
  { ...base, id: 'd', title: 'Fertig', plannedEnd: '2026-10-05' },
]
const filters = { search: '', status: 'all', periodStart: null, periodEnd: null, includeUndated: false }

test('search finds metadata and combines it with status without mutating records', () => {
  assert.deepEqual(filterConstructionSites(sites, { ...filters, search: ' PRÜFENINGER ', status: 'planned' }, 'de-DE').map(s => s.id), ['a'])
  assert.deepEqual(filterConstructionSites(sites, { ...filters, search: 'Prüfeninger', status: 'draft' }, 'de-DE'), [])
  assert.equal(sites.length, 4)
})

test('period uses inclusive overlap and explicitly includes incomplete dates', () => {
  const period = { ...filters, periodStart: '2026-10-20', periodEnd: '2026-10-31' }
  assert.deepEqual(filterConstructionSites(sites, period, 'de-DE').map(s => s.id), ['a'])
  assert.deepEqual(filterConstructionSites(sites, { ...period, includeUndated: true }, 'de-DE').map(s => s.id), ['a', 'b'])
  assert.deepEqual(filterConstructionSites(sites, filters, 'de-DE').map(s => s.id), ['a', 'b', 'c', 'd'])
})

test('save payload normalizes optional fields and preserves child identities', () => {
  const values = { title: ' Canal ', status: 'draft', plannedStart: '', plannedEnd: '', diversion: ' ', contacts: [{ id: 'contact-1', firstName: ' A ', lastName: ' B ', role: ' C ', email: '', phone1: ' 123 ', phone2: '' }], communications: [{ id: null, type: ' Notice ', note: ' ' }], metadata: [{ key: ' x ', value: ' y ' }] }
  const request = toWriteRequest(values, [])
  assert.equal(request.title, 'Canal')
  assert.equal(request.plannedStart, null)
  assert.equal(request.diversion, null)
  assert.deepEqual(request.contacts[0], { id: 'contact-1', firstName: 'A', lastName: 'B', role: 'C', email: null, phone1: '123', phone2: null })
  assert.deepEqual(request.communications, [{ id: null, type: 'Notice', note: null }])
  assert.deepEqual(request.metadata, { x: 'y' })
  assert.equal(values.title, ' Canal ')
})
