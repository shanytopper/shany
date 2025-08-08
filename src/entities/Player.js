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

    // Register a pointer event for firing. Instead of firing on a single
    // pointerdown, we will check for pointer.isDown during update and
    // respect a cooldown. Nonetheless we keep a reference to the pointer
    // object here.
    this.pointer = scene.input.activePointer;
    // Store time of last fired bullet. This is separate from
    // lastFiredAtMs so that update can throttle firing.
    this.lastBulletTime = 0;
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
    // Handle mouse firing with a cooldown. If the primary mouse button is
    // held down (pointer.isDown) and enough time has elapsed since the
    // last shot, spawn a bullet. This ensures bullets fire continuously
    // while the button is held.
    if (this.pointer.isDown) {
      const now = this.scene.time.now;
      if (now - this.lastBulletTime >= this.fireCooldownMs) {
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
        this.lastBulletTime = now;
      }
    }
  }

  fireBullet(direction) {
    // Spawn the bullet slightly offset from the player so that it doesn’t
    // immediately collide with the player's body. The offset distance
    // corresponds to twice the player's sprite size (16px * scale).
    // We add a small extra offset equal to the bullet radius (4px) to
    // guarantee that the bullet spawns outside the player's collider.
    const offset = 16 * 2 + 4;
    const spawnX = this.x + direction.x * offset;
    const spawnY = this.y + direction.y * offset;
    const bullet = this.scene.physics.add.image(spawnX, spawnY, 'bullet');
    bullet.setDepth(5);
    // Use the generated bullet sprite at its native scale (4x4). Set the
    // physics body size to match half of the visual size for more accurate
    // collisions.
    bullet.setScale(1);
    // Define a circular body with radius 4 at (0,0). Passing a second
    // argument of 0 sets both the horizontal and vertical offset to 0.
    bullet.setCircle(4, 0, 0);
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