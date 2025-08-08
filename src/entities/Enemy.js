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
    // Scale up the enemy sprite to make it more visible.
    this.setScale(2);
    // Start the default walk animation
    this.anims.play('enemy-walk');
  }

  update(player) {
    if (!player) return;
    // Move toward the player. Phaser's moveToObject calculates the
    // velocity vector required to travel toward the target at the given
    // speed. This ensures the enemy will chase the player smoothly.
    this.scene.physics.moveToObject(this, player, this.speed);

    // Flip sprite horizontally based on x direction to face left or right
    if (this.body.velocity.x < 0) {
      this.flipX = true;
    } else if (this.body.velocity.x > 0) {
      this.flipX = false;
    }

    // Restart the walk animation if it has stopped. This prevents the
    // enemy sprite from freezing on a single frame when chasing.
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