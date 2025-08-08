// Player character for the roguelite POC.
const Phaser = globalThis.Phaser;

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    // Movement input: WASD
    this.cursors = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    // Shooting input: arrow keys
    this.shootKeys = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
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
    const shootDir = new Phaser.Math.Vector2(0, 0);
    if (this.shootKeys.left.isDown) shootDir.x -= 1;
    if (this.shootKeys.right.isDown) shootDir.x += 1;
    if (this.shootKeys.up.isDown) shootDir.y -= 1;
    if (this.shootKeys.down.isDown) shootDir.y += 1;
    if (shootDir.lengthSq() > 0 && time - this.lastFiredAtMs > this.fireCooldownMs) {
      this.lastFiredAtMs = time;
      this.fireBullet(shootDir.normalize());
    }
  }

  fireBullet(direction) {
    const bullet = this.scene.physics.add.image(this.x, this.y, 'bullet');
    bullet.setDepth(5);
    bullet.setCircle(2);
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