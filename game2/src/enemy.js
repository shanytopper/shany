// Enemy class definition for the roguelike POC.
// An enemy moves toward the player and takes damage when hit by bullets.
export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * Create a new enemy.
   * @param {Phaser.Scene} scene The owning scene.
   * @param {number} x The initial X position.
   * @param {number} y The initial Y position.
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    // Basic stats
    this.speed = 70;
    this.maxHealth = 2;
    this.health = this.maxHealth;

    // Reference to the player; set by the scene
    this.player = null;
  }

  /**
   * Called every frame by the scene to update the enemy behaviour.
   */
  update() {
    if (!this.active || !this.player) return;
    // Calculate vector toward the player and set velocity
    const dx = this.player.x - this.x;
    const dy = this.player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const vx = (dx / dist) * this.speed;
      const vy = (dy / dist) * this.speed;
      this.setVelocity(vx, vy);
    } else {
      this.setVelocity(0, 0);
    }
    // Rotate sprite to face the player
    this.setRotation(Phaser.Math.Angle.Between(this.x, this.y, this.player.x, this.player.y) + Math.PI / 2);
  }

  /**
   * Damage the enemy by a given amount. If health reaches zero, disable the enemy.
   * @param {number} amount The damage amount.
   */
  takeDamage(amount = 1) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.destroy();
    }
  }
}