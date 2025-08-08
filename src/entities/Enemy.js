// Basic enemy class for the roguelite POC.
const Phaser = globalThis.Phaser;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setCircle(6, 1, 1);
    this.speed = 60;
    this.health = 2;
    // Start the default walk animation
    this.anims.play('enemy-walk');
  }

  update(player) {
    if (!player) return;
    const dir = new Phaser.Math.Vector2(player.x - this.x, player.y - this.y);
    dir.normalize().scale(this.speed);
    this.setVelocity(dir.x, dir.y);

    // Flip sprite horizontally based on x direction to face left or right
    if (dir.x < 0) {
      this.flipX = true;
    } else if (dir.x > 0) {
      this.flipX = false;
    }

    // Play walking animation if not already playing
    if (!this.anims.isPlaying) {
      this.anims.play('enemy-walk');
    }
  }

  takeDamage(amount = 1) {
    this.health -= amount;
    this.setTint(0xffffff * Math.random());
    if (this.health <= 0) {
      this.destroy();
    }
  }
}