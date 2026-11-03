import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import {
  buildRouteNetwork,
  prepareRouteNetwork,
} from '../src/features/routes/route-network-model.ts'

const geometry = (...lines) => ({ type: 'MultiLineString', coordinates: lines })
const network = (geometries, tolerance = 0) =>
  buildRouteNetwork(prepareRouteNetwork(geometries), tolerance)
const length = (runs) =>
  runs.reduce(
    (total, run) =>
      total +
      run.coordinates
        .slice(1)
        .reduce(
          (sum, point, index) =>
            sum +
            Math.hypot(point[0] - run.coordinates[index][0], point[1] - run.coordinates[index][1]),
          0,
        ),
    0,
  )

test('opposite directions share one display stroke without changing source geometries', () => {
  const input = [
    geometry([
      [0, 0],
      [50, 0],
    ]),
    geometry([
      [50, 0],
      [0, 0],
    ]),
  ]
  const before = structuredClone(input)
  const result = network(input)
  assert.deepEqual(result, [
    {
      coordinates: [
        [0, 0],
        [50, 0],
      ],
      offsetMetres: 0,
    },
  ])
  result[0].coordinates[0][0] = 100
  assert.deepEqual(input, before)
})

test('different sampling of the same road does not paint overlapping chords', () => {
  const result = network([
    geometry([
      [0, 0],
      [10, 0],
      [20, 0],
    ]),
    geometry([
      [0, 0],
      [20, 0],
    ]),
  ])
  assert.equal(length(result), 20)
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].coordinates, [
    [0, 0],
    [20, 0],
  ])
})

test('partially overlapping roads retain their uncovered extension', () => {
  const result = network([
    geometry([
      [0, 0],
      [30, 0],
    ]),
    geometry([
      [20, 0],
      [40, 0],
    ]),
  ])
  assert.equal(length(result), 40)
  assert.ok(result.some((run) => run.coordinates.at(-1)[0] === 40))
  assert.ok(result.some((run) => run.coordinates[0][0] === 30 && run.offsetMetres === 10))
})

test('runs after a covered gap retain cumulative station rather than restarting the dash', () => {
  const result = network([
    geometry([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
    ]),
    geometry([
      [10, 0],
      [30, 0],
    ]),
  ])
  assert.equal(length(result), 40)
  const tail = result.find((run) => run.coordinates[0][0] === 30)
  assert.equal(tail.offsetMetres, 30)
  assert.deepEqual(tail.coordinates, [
    [30, 0],
    [40, 0],
  ])
})

test('display tolerance removes near-parallel duplicates but preserves diverging branches', () => {
  const input = [
    geometry([
      [0, 0],
      [40, 0],
    ]),
    geometry([
      [0, 0.1],
      [40, 0.1],
    ]),
    geometry([
      [0, 0],
      [20, 10],
    ]),
  ]
  const result = network(input, 0.5)
  assert.equal(result.length, 2)
  assert.ok(result.some((run) => run.coordinates.at(-1)[1] === 10))
  assert.equal(length(result), 40 + Math.hypot(20, 10))
})

test('a shallow branch remains visible after leaving the shared display corridor', () => {
  const result = network(
    [
      geometry([
        [0, 0],
        [40, 0],
      ]),
      geometry([
        [0, 0],
        [20, 1],
      ]),
    ],
    0.2,
  )
  const branch = result.find((run) => run.coordinates.at(-1)[1] === 1)
  assert.ok(branch)
  assert.ok(branch.coordinates[0][0] > 0 && branch.coordinates[0][0] < 5)
  assert.ok(branch.offsetMetres > 0)
})

test('preparation and display output are deterministic across input order and line direction', () => {
  const input = [
    geometry([
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [40, 0],
    ]),
    geometry([
      [10, 0],
      [30, 0],
    ]),
    geometry([
      [20, 0],
      [40, 3],
    ]),
  ]
  const reversed = input
    .toReversed()
    .map((item) => geometry(...item.coordinates.map((line) => line.toReversed())))
  assert.deepEqual(network(reversed, 0.5), network(input, 0.5))
  const prepared = prepareRouteNetwork(input)
  assert.deepEqual(buildRouteNetwork(prepared, 0), network(input, 0))
  assert.deepEqual(buildRouteNetwork(prepared, 0.5), network(input, 0.5))
})

test('empty, collapsed and invalid coordinate lines produce no display geometry', () => {
  assert.deepEqual(network([]), [])
  assert.deepEqual(
    network([
      geometry(
        [],
        [
          [1, 1],
          [1, 1],
        ],
        [
          [NaN, 0],
          [2, 2],
        ],
      ),
    ]),
    [],
  )
})

test('very long segments use bounded spatial indexing and retain uncovered crossings', () => {
  const result = network(
    [
      geometry([
        [0, 0],
        [1_000_000, 1_000_000],
      ]),
      geometry([
        [0, 1_000_000],
        [1_000_000, 0],
      ]),
    ],
    1,
  )
  assert.equal(result.length, 2)
  assert.equal(length(result), 2 * Math.hypot(1_000_000, 1_000_000))
})

test('unsafe grid coordinates cannot stall the spatial index loop', () => {
  const moduleUrl = new URL('../src/features/routes/route-network-model.ts', import.meta.url).href
  const script = `import { prepareRouteNetwork, buildRouteNetwork } from ${JSON.stringify(moduleUrl)};
    const data = prepareRouteNetwork([{ type: 'MultiLineString', coordinates: [[[1e20, 0], [1e20, 10]]] }]);
    if (buildRouteNetwork(data, 1).length !== 1) { process.exit(2); }`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 5000,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
})
