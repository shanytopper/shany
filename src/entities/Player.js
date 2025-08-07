const Phaser = globalThis.Phaser;  

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.speed = 180
    this.fireCooldownMs = 150
    this.lastFiredAtMs = 0
    this.health = 6 // 3 hearts

    this.setCollideWorldBounds(true)
    this.setSize(8, 8)
    this.setOffset(0, 0)

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,SPACE')

    this.bullets = scene.physics.add.group({ classType: Phaser.Physics.Arcade.Image })
  }

  update(time) {
    const left = this.cursors.left.isDown || this.keys.A.isDown
    const right = this.cursors.right.isDown || this.keys.D.isDown
    const up = this.cursors.up.isDown || this.keys.W.isDown
    const down = this.cursors.down.isDown || this.keys.S.isDown

    const velocity = new Phaser.Math.Vector2(0, 0)
    if (left) velocity.x -= 1
    if (right) velocity.x += 1
    if (up) velocity.y -= 1
    if (down) velocity.y += 1
    velocity.normalize().scale(this.speed)
    this.setVelocity(velocity.x, velocity.y)

    if (this.inputActive() && time - this.lastFiredAtMs > this.fireCooldownMs) {
      this.lastFiredAtMs = time
      this.fireBullet()
    }
  }

  inputActive() {
    return this.scene.input.activePointer.isDown || this.keys.SPACE.isDown
  }

  fireBullet() {
    const pointer = this.scene.input.activePointer
    const dir = new Phaser.Math.Vector2(pointer.worldX - this.x, pointer.worldY - this.y)
      .normalize()
      .scale(360)
    const bullet = this.scene.physics.add.image(this.x, this.y, 'bullet')
    bullet.setDepth(5)
    bullet.setCircle(2)
    bullet.setVelocity(dir.x, dir.y)
    bullet.lifespanMs = 500
    bullet.spawnedAt = this.scene.time.now
    this.bullets.add(bullet)
  }

  takeDamage(amount = 1) {
    this.health = Math.max(0, this.health - amount)
  }
}
