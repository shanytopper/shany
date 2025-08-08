// Player character for the roguelite POC.
const Phaser = globalThis.Phaser;

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    // Scale the player sprite up for better visibility.
    this.setScale(2);
    // Movement input: WASD
    this.cursors = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    // Shooting input: arrow keys
    // Shooting will be performed via the mouse button instead of arrow keys.
    this.shootKeys = {};
    this.speed = 180;
    this.fireCooldownMs = 200;
    this.lastFiredAtMs = 0;
    this.health = 6;
    this.bullets = scene.physics.add.group({ classType: Phaser.Physics.Arcade.Image });

    // Keep track of the last facing direction for idle frames.
    this.lastDirection = 'down';
  }

  update(time) {
    // Movement
    const velocity = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown) velocity.x -= 1;
    if (this.cursors.right.isDown) velocity.x += 1;
    if (this.cursors.up.isDown) velocity.y -= 1;
    if (this.cursors.down.isDown) velocity.y += 1;
    velocity.normalize().scale(this.speed);
    this.setVelocity(velocity.x, velocity.y);

    // Play walking animations based on movement direction. If the
    // player is not moving, stop the animation and show the first
    // frame of the last direction faced.
    if (velocity.lengthSq() === 0) {
      this.anims.stop();
      // Set to the first frame of the last facing direction when idle
      switch (this.lastDirection) {
        case 'up':
          this.setFrame(3);
          break;
        case 'left':
          this.setFrame(6);
          break;
        case 'right':
          this.setFrame(9);
          break;
        case 'down':
        default:
          this.setFrame(0);
          break;
      }
    } else {
      // Determine whether horizontal or vertical movement is dominant
      if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
        if (velocity.x > 0) {
          this.lastDirection = 'right';
          this.anims.play('player-right', true);
        } else {
          this.lastDirection = 'left';
          this.anims.play('player-left', true);
        }
      } else {
        if (velocity.y > 0) {
          this.lastDirection = 'down';
          this.anims.play('player-down', true);
        } else {
          this.lastDirection = 'up';
          this.anims.play('player-up', true);
        }
      }
    }
    // Shooting
    // Use the mouse button for shooting. When the left mouse button
    // is held down, fire a bullet in the direction the player is
    // currently facing. This uses the lastDirection property set by
    // movement logic above. The fire rate is governed by
    // fireCooldownMs.
    const pointer = this.scene.input.activePointer;
    if (pointer.isDown && time - this.lastFiredAtMs > this.fireCooldownMs) {
      this.lastFiredAtMs = time;
      let dir;
      switch (this.lastDirection) {
        case 'up':
          dir = new Phaser.Math.Vector2(0, -1);
          break;
        case 'left':
          dir = new Phaser.Math.Vector2(-1, 0);
          break;
        case 'right':
          dir = new Phaser.Math.Vector2(1, 0);
          break;
        case 'down':
        default:
          dir = new Phaser.Math.Vector2(0, 1);
          break;
      }
      this.fireBullet(dir);
    }
  }

  fireBullet(direction) {
    const bullet = this.scene.physics.add.image(this.x, this.y, 'bullet');
    bullet.setDepth(5);
    // Use the generated bullet sprite at its native scale (4x4). Set the
    // physics body size to match half of the visual size for more accurate
    // collisions.
    bullet.setScale(1);
    bullet.setCircle(4); // radius equals half of 8px bullet size
    // Set velocity based on the provided direction. Bullets travel faster than player movement.
    bullet.setVelocity(direction.x * 360, direction.y * 360);
    bullet.lifespanMs = 700;
    bullet.spawnedAt = this.scene.time.now;
    this.bullets.add(bullet);
  }

  takeDamage(amount = 1) {
    this.health = Math.max(0, this.health - amount);
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());
  }
}