const Phaser = globalThis.Phaser;  
import { Player } from '../entities/Player.js'
import { Enemy } from '../entities/Enemy.js'
import { DungeonGenerator } from '../systems/DungeonGenerator.js'

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('DungeonScene')
    this.tileSize = 16
    this.roomTiles = 16
    this.roomsWide = 4
    this.roomsHigh = 3
  }

  create() {
    const generator = new DungeonGenerator({ roomsWide: this.roomsWide, roomsHigh: this.roomsHigh, tilesPerRoom: this.roomTiles })
    this.rooms = generator.generate()

    // Build a simple tilemap with static wall/floor
    const mapWidth = this.roomsWide * this.roomTiles
    const mapHeight = this.roomsHigh * this.roomTiles
    this.floor = this.add.layer()
    this.walls = this.physics.add.staticGroup()

    for (let ry = 0; ry < this.roomsHigh; ry++) {
      for (let rx = 0; rx < this.roomsWide; rx++) {
        if (!this.rooms[ry][rx].exists) continue
        const roomX = rx * this.roomTiles
        const roomY = ry * this.roomTiles
        for (let ty = 0; ty < this.roomTiles; ty++) {
          for (let tx = 0; tx < this.roomTiles; tx++) {
            const wx = (roomX + tx) * this.tileSize
            const wy = (roomY + ty) * this.tileSize
            const isBorder = ty === 0 || ty === this.roomTiles - 1 || tx === 0 || tx === this.roomTiles - 1
            if (isBorder) {
              const wall = this.physics.add.staticImage(wx + this.tileSize / 2, wy + this.tileSize / 2, 'wall')
              wall.setDisplaySize(this.tileSize, this.tileSize)
              this.walls.add(wall)
            } else {
              const tile = this.add.image(wx + this.tileSize / 2, wy + this.tileSize / 2, 'floor')
              tile.setDisplaySize(this.tileSize, this.tileSize)
              this.floor.add(tile)
            }
          }
        }
        // carve doors to adjacent rooms
        if (ry > 0 && this.rooms[ry - 1][rx].exists) this.clearWall(roomX, roomY, Math.floor(this.roomTiles / 2), 0)
        if (ry < this.roomsHigh - 1 && this.rooms[ry + 1][rx].exists) this.clearWall(roomX, roomY, Math.floor(this.roomTiles / 2), this.roomTiles - 1)
        if (rx > 0 && this.rooms[ry][rx - 1].exists) this.clearWall(roomX, roomY, 0, Math.floor(this.roomTiles / 2))
        if (rx < this.roomsWide - 1 && this.rooms[ry][rx + 1].exists) this.clearWall(roomX, roomY, this.roomTiles - 1, Math.floor(this.roomTiles / 2))
      }
    }

    // Player
    const startRoom = this.findFirstRoom()
    const startPos = this.roomCenterToWorld(startRoom)
    this.player = new Player(this, startPos.x, startPos.y)

    // Enemies
    this.enemies = this.add.group({ classType: Enemy, runChildUpdate: true })
    for (let i = 0; i < 8; i++) {
      const room = this.randomRoom()
      const pos = this.roomCenterToWorld(room)
      const enemy = new Enemy(this, pos.x + Phaser.Math.Between(-40, 40), pos.y + Phaser.Math.Between(-40, 40))
      this.enemies.add(enemy)
    }

    // Collisions
    this.physics.add.collider(this.player, this.walls)
    this.physics.add.collider(this.enemies, this.walls)
    this.physics.add.collider(this.enemies, this.enemies)

    this.physics.add.overlap(this.player.bullets, this.enemies, (bullet, enemy) => {
      bullet.destroy()
      enemy.takeDamage(1)
    })

    this.physics.add.collider(this.player.bullets, this.walls, (bullet) => {
      bullet.destroy()
    })

    this.physics.add.overlap(this.player, this.enemies, () => {
      this.player.takeDamage(1)
      this.cameras.main.flash(100, 255, 0, 0)
    })

    // Cleanup bullets
    this.time.addEvent({ delay: 50, loop: true, callback: this.cleanupBullets, callbackScope: this })

    // Camera + world bounds
    this.cameras.main.setBounds(0, 0, mapWidth * this.tileSize, mapHeight * this.tileSize)
    this.physics.world.setBounds(0, 0, mapWidth * this.tileSize, mapHeight * this.tileSize)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)

    // Start UI
    this.scene.launch('UIScene')
  }

  update(time) {
    this.player.update(time)
    this.enemies.children.iterate((enemy) => {
      if (enemy && enemy.active) enemy.update(this.player)
    })
  }

  cleanupBullets() {
    const now = this.time.now
    this.player.bullets.getChildren().forEach((b) => {
      if (!b.active) return
      if (now - b.spawnedAt > b.lifespanMs) b.destroy()
    })
  }

  roomCenterToWorld(room) {
    const x = (room.rx * this.roomTiles + Math.floor(this.roomTiles / 2)) * this.tileSize
    const y = (room.ry * this.roomTiles + Math.floor(this.roomTiles / 2)) * this.tileSize
    return { x, y }
  }

  findFirstRoom() {
    for (let ry = 0; ry < this.roomsHigh; ry++) {
      for (let rx = 0; rx < this.roomsWide; rx++) {
        if (this.rooms[ry][rx].exists) return { rx, ry }
      }
    }
    return { rx: 0, ry: 0 }
  }

  randomRoom() {
    const candidates = []
    for (let ry = 0; ry < this.roomsHigh; ry++) {
      for (let rx = 0; rx < this.roomsWide; rx++) {
        if (this.rooms[ry][rx].exists) candidates.push({ rx, ry })
      }
    }
    return Phaser.Utils.Array.GetRandom(candidates)
  }

  clearWall(roomX, roomY, tx, ty) {
    const wx = (roomX + tx) * this.tileSize + this.tileSize / 2
    const wy = (roomY + ty) * this.tileSize + this.tileSize / 2
    // Find a wall at this position and remove it
    const found = this.walls.getChildren().find((w) => Math.abs(w.x - wx) < 1 && Math.abs(w.y - wy) < 1)
    if (found) {
      this.walls.remove(found, true, true)
      const tile = this.add.image(wx, wy, 'floor')
      tile.setDisplaySize(this.tileSize, this.tileSize)
      this.floor.add(tile)
    }
  }
}
