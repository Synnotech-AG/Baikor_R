import type { MultiLineStringDto } from './types'

type Point = [number, number]
type Interval = [number, number]

interface NetworkEdge {
  start: Point
  end: Point
  length: number
  station: number
  line: number
  segment: number
  key: string
}

interface Segment {
  start: Point
  end: Point
  length: number
}

interface RetainedPiece {
  edge: NetworkEdge
  interval: Interval
}

export interface RouteNetworkRun {
  coordinates: number[][]
  offsetMetres: number
}

const edgesKey = Symbol('prepared-route-network')
export interface RouteNetworkData {
  readonly [edgesKey]: readonly NetworkEdge[]
}

const epsilon = 1e-7
const parallelCosine = Math.cos(Math.PI / 12)
const maximumGridCells = 1024

function comparePoint(left: Point, right: Point): number {
  return left[0] - right[0] || left[1] - right[1]
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1])
}

function canonicalLine(line: number[][]): Point[] {
  if (line.some((point) => point.length < 2 || !point.slice(0, 2).every(Number.isFinite))) {
    return []
  }
  const coordinates: Point[] = []
  for (const point of line) {
    const copy: Point = [point[0] || 0, point[1] || 0]
    if (!coordinates.length || distance(coordinates.at(-1)!, copy) > epsilon) {
      coordinates.push(copy)
    }
  }
  for (let index = 0; index < coordinates.length; index += 1) {
    const comparison = comparePoint(coordinates[index], coordinates[coordinates.length - index - 1])
    if (comparison !== 0) {
      return comparison < 0 ? coordinates : coordinates.reverse()
    }
  }
  return coordinates
}

/** Canonicalize once when route data changes; zoom-dependent masking stays separate. */
export function prepareRouteNetwork(geometries: MultiLineStringDto[]): RouteNetworkData {
  const lines = new Map<string, { coordinates: Point[]; length: number; key: string }>()
  for (const geometry of geometries) {
    for (const line of geometry.coordinates) {
      const coordinates = canonicalLine(line)
      const length = coordinates
        .slice(1)
        .reduce((sum, point, index) => sum + distance(coordinates[index], point), 0)
      if (coordinates.length < 2 || !Number.isFinite(length)) {
        continue
      }
      const key = JSON.stringify(coordinates)
      lines.set(key, { coordinates, length, key })
    }
  }
  const ordered = [...lines.values()].sort(
    (left, right) => right.length - left.length || left.key.localeCompare(right.key, 'en'),
  )
  const unique = new Map<string, NetworkEdge>()
  for (let line = 0; line < ordered.length; line += 1) {
    const coordinates = ordered[line].coordinates
    let station = 0
    for (let segment = 0; segment < coordinates.length - 1; segment += 1) {
      const start = coordinates[segment]
      const end = coordinates[segment + 1]
      const length = distance(start, end)
      const key = JSON.stringify(comparePoint(start, end) < 0 ? [start, end] : [end, start])
      if (!unique.has(key)) {
        unique.set(key, { start, end, length, station, line, segment, key })
      }
      station += length
    }
  }
  return {
    [edgesKey]: [...unique.values()].sort(
      (left, right) => right.length - left.length || left.key.localeCompare(right.key, 'en'),
    ),
  }
}

function cellRange(segment: Segment, size: number, padding: number): number[] {
  return [
    Math.floor((Math.min(segment.start[0], segment.end[0]) - padding) / size),
    Math.floor((Math.min(segment.start[1], segment.end[1]) - padding) / size),
    Math.floor((Math.max(segment.start[0], segment.end[0]) + padding) / size),
    Math.floor((Math.max(segment.start[1], segment.end[1]) + padding) / size),
  ]
}

function isLargeRange([left, bottom, right, top]: number[]): boolean {
  return (
    ![left, bottom, right, top].every(Number.isSafeInteger) ||
    (right - left + 1) * (top - bottom + 1) > maximumGridCells
  )
}

/** A bounded grid prevents one unusually long manual line from allocating millions of cells. */
class SegmentIndex {
  private cells = new Map<string, Segment[]>()
  private large: Segment[] = []
  private all: Segment[] = []
  private size: number
  private tolerance: number

  constructor(tolerance: number) {
    this.tolerance = tolerance
    this.size = Math.max(100, tolerance * 4)
  }

  add(segment: Segment): void {
    this.all.push(segment)
    const range = cellRange(segment, this.size, 0)
    if (isLargeRange(range)) {
      this.large.push(segment)
      return
    }
    for (let x = range[0]; x <= range[2]; x += 1) {
      for (let y = range[1]; y <= range[3]; y += 1) {
        const key = `${x},${y}`
        const bucket = this.cells.get(key)
        if (bucket) {
          bucket.push(segment)
        } else {
          this.cells.set(key, [segment])
        }
      }
    }
  }

  query(segment: Segment): Iterable<Segment> {
    const range = cellRange(segment, this.size, this.tolerance + epsilon)
    if (isLargeRange(range)) {
      return this.all
    }
    const candidates = new Set(this.large)
    for (let x = range[0]; x <= range[2]; x += 1) {
      for (let y = range[1]; y <= range[3]; y += 1) {
        for (const candidate of this.cells.get(`${x},${y}`) ?? []) {
          candidates.add(candidate)
        }
      }
    }
    return candidates
  }
}

function clip(
  interval: Interval,
  origin: number,
  delta: number,
  lower: number,
  upper: number,
): Interval | null {
  if (Math.abs(delta) < epsilon) {
    return origin >= lower - epsilon && origin <= upper + epsilon ? interval : null
  }
  const first = (lower - origin) / delta
  const last = (upper - origin) / delta
  const start = Math.max(interval[0], Math.min(first, last))
  const end = Math.min(interval[1], Math.max(first, last))
  return end > start ? [start, end] : null
}

/** Portion of an incoming edge covered by an already visible, nearly parallel segment. */
function coverage(edge: NetworkEdge, existing: Segment, tolerance: number): Interval | null {
  const dx = edge.end[0] - edge.start[0]
  const dy = edge.end[1] - edge.start[1]
  const ux = (existing.end[0] - existing.start[0]) / existing.length
  const uy = (existing.end[1] - existing.start[1]) / existing.length
  if (Math.abs((dx * ux + dy * uy) / edge.length) < parallelCosine) {
    return null
  }
  const x = edge.start[0] - existing.start[0]
  const y = edge.start[1] - existing.start[1]
  const along = clip([0, 1], x * ux + y * uy, dx * ux + dy * uy, 0, existing.length)
  return along ? clip(along, x * uy - y * ux, dx * uy - dy * ux, -tolerance, tolerance) : null
}

function position(edge: NetworkEdge, fraction: number): Point {
  return [
    edge.start[0] + (edge.end[0] - edge.start[0]) * fraction,
    edge.start[1] + (edge.end[1] - edge.start[1]) * fraction,
  ]
}

/** Mask overlaps only for display; original features remain available for picking and evidence. */
export function buildRouteNetwork(
  data: RouteNetworkData,
  toleranceMetres: number,
): RouteNetworkRun[] {
  const tolerance = Number.isFinite(toleranceMetres) ? Math.max(0, toleranceMetres) : 0
  const index = new SegmentIndex(tolerance)
  const pieces: RetainedPiece[] = []
  for (const edge of data[edgesKey]) {
    const covered = [...index.query(edge)]
      .map((candidate) => coverage(edge, candidate, tolerance))
      .filter((interval): interval is Interval => interval !== null)
      .sort((left, right) => left[0] - right[0])
    let cursor = 0
    const retain = (end: number) => {
      if ((end - cursor) * edge.length > epsilon) {
        const start = position(edge, cursor)
        const finish = position(edge, end)
        index.add({ start, end: finish, length: distance(start, finish) })
        pieces.push({ edge, interval: [cursor, end] })
      }
    }
    for (const [start, end] of covered) {
      retain(start)
      cursor = Math.max(cursor, end)
    }
    retain(1)
  }
  pieces.sort(
    (left, right) =>
      left.edge.line - right.edge.line ||
      left.edge.segment - right.edge.segment ||
      left.interval[0] - right.interval[0],
  )
  const runs: RouteNetworkRun[] = []
  let previousLine = -1
  let previousStation = -1
  for (const {
    edge,
    interval: [start, end],
  } of pieces) {
    const first = position(edge, start)
    const last = position(edge, end)
    const station = edge.station + start * edge.length
    const current = runs.at(-1)
    if (
      current &&
      previousLine === edge.line &&
      Math.abs(previousStation - station) < epsilon &&
      distance(current.coordinates.at(-1)! as Point, first) < epsilon
    ) {
      current.coordinates.push(last)
    } else {
      runs.push({ coordinates: [first, last], offsetMetres: station })
    }
    previousLine = edge.line
    previousStation = edge.station + end * edge.length
  }
  return runs
}
