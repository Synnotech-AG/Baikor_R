export interface GeometryAreaSnapshot {
  key: string
  id: string | null
  name: string
  coordinates: number[][][]
}

export type GeometrySnapshot = GeometryAreaSnapshot[]

function copySnapshot(snapshot: GeometrySnapshot): GeometrySnapshot {
  return snapshot.map(({ key, id, name, coordinates }) => ({
    key, id, name,
    coordinates: coordinates.map((ring) => ring.map((coordinate) => [...coordinate])),
  }))
}

function snapshotSignature(snapshot: GeometrySnapshot) {
  return JSON.stringify(copySnapshot(snapshot).sort((left, right) => left.key.localeCompare(right.key)))
}

export class GeometryHistory {
  private baseSignature = snapshotSignature([])
  private current: GeometrySnapshot = []
  private previous: GeometrySnapshot[] = []
  private limit: number

  constructor(limit = 30) {
    this.limit = Math.max(1, Math.floor(limit))
  }

  reset(snapshot: GeometrySnapshot) {
    this.current = copySnapshot(snapshot)
    this.baseSignature = snapshotSignature(snapshot)
    this.previous = []
  }

  record(snapshot: GeometrySnapshot) {
    if (snapshotSignature(snapshot) === snapshotSignature(this.current)) return false
    this.previous = [...this.previous, this.current].slice(-this.limit)
    this.current = copySnapshot(snapshot)
    return true
  }

  undo(): GeometrySnapshot | null {
    const snapshot = this.previous.pop()
    if (!snapshot) return null
    this.current = snapshot
    return copySnapshot(snapshot)
  }

  get canUndo() { return this.previous.length > 0 }
  get isDirty() { return snapshotSignature(this.current) !== this.baseSignature }
  hasChanges(snapshot: GeometrySnapshot) { return snapshotSignature(snapshot) !== this.baseSignature }
}
