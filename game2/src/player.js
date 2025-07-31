// Player class definition for the roguelike POC.
// The player can move with WASD keys, shoot toward the pointer and take damage.
export default class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * Construct a new Player.
   * @param {Phaser.Scene} scene The scene to which this player belongs.
   * @param {number} x Initial X position.
   * @param {number} y Initial Y position.
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    // Add to scene and enable physics
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    // Player statistics
    this.maxHealth = 3;
    this.health = this.maxHealth;

    // Movement speed in pixels per second
    this.speed = 180;

    // A reference to cursors will be set by the scene during update
    this.cursors = null;
  }

  /**
   * Update the player's movement based on keyboard cursors.
   */
  handleMovement() {
    if (!this.cursors) return;
    const { W, A, S, D } = this.cursors;
    const velocity = new Phaser.Math.Vector2(0, 0);
    if (W.isDown) velocity.y = -1;
    else if (S.isDown) velocity.y = 1;
    if (A.isDown) velocity.x = -1;
    else if (D.isDown) velocity.x = 1;
    velocity.normalize();
    this.setVelocity(velocity.x * this.speed, velocity.y * this.speed);
  }

  /**
   * Deal damage to the player.
   * @param {number} amount The amount of health to subtract.
   */
  takeDamage(amount = 1) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }

  /**
   * Restore health to the player (e.g. by picking up a heart).
   * @param {number} amount The amount of health to restore.
   */
  heal(amount = 1) {
    this.health += amount;
    if (this.health > this.maxHealth) this.health = this.maxHealth;
  }
}