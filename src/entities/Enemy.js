const Phaser = globalThis.Phaser;  

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy')
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.speed = 80
    this.setCollideWorldBounds(true)
    this.setCircle(6, 1, 1)
    this.health = 2
  }

  update(player) {
    const dir = new Phaser.Math.Vector2(player.x - this.x, player.y - this.y)
    dir.normalize().scale(this.speed)
    this.setVelocity(dir.x, dir.y)
  }

  takeDamage(amount = 1) {
    this.health -= amount
    if (this.health <= 0) {
      this.destroy()
    }
  }
}
