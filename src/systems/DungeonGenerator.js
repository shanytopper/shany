export class DungeonGenerator {
  constructor({ roomsWide = 4, roomsHigh = 3, tilesPerRoom = 16, rng = Math.random } = {}) {
    this.roomsWide = roomsWide
    this.roomsHigh = roomsHigh
    this.tilesPerRoom = tilesPerRoom
    this.rng = rng
  }

  generate() {
    const grid = Array.from({ length: this.roomsHigh }, () =>
      Array.from({ length: this.roomsWide }, () => ({ exists: false }))
    )

    // Random walk from center to carve connected rooms
    let x = Math.floor(this.roomsWide / 2)
    let y = Math.floor(this.roomsHigh / 2)
    const steps = this.roomsWide * this.roomsHigh * 2
    grid[y][x].exists = true

    for (let i = 0; i < steps; i++) {
      const dir = Math.floor(this.rng() * 4)
      if (dir === 0 && x > 0) x--
      if (dir === 1 && x < this.roomsWide - 1) x++
      if (dir === 2 && y > 0) y--
      if (dir === 3 && y < this.roomsHigh - 1) y++
      grid[y][x].exists = true
    }

    return grid
  }
}