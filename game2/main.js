// Basic proof‑of‑concept game inspired by The Binding of Isaac.
//
// The objective of this file is to set up a simple roguelike arena where
// the player can move around, shoot bullets at approaching enemies,
// collect heart items to regain health, and watch their health bar update.

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.player = null;
    this.bullets = null;
    this.enemies = null;
    this.items = null;
    this.cursors = null;
    this.maxHealth = 3;
    this.health = 3;
    this.healthIcons = [];
  }

  preload() {
    // Load all artwork for the game.  These assets were gathered from
    // free collections on OpenGameArt and UnluckyStudio (see README).
    this.load.image('player', 'assets/player.png');
    this.load.image('bullet', 'assets/bullet.png');
    this.load.image('enemy', 'assets/enemy.png');
    this.load.image('floor', 'assets/floor.png');
    this.load.image('heart', 'assets/item.png');
  }

  create() {
    const { width, height } = this.scale;

    // Create a tiled floor that covers the entire play area.  The tileSprite
    // will automatically repeat the texture to fill its rectangle.
    this.floor = this.add.tileSprite(0, 0, width, height, 'floor')
      .setOrigin(0, 0);

    // Enable world bounds so the player and enemies cannot leave the room.
    this.physics.world.setBounds(0, 0, width, height);

    // Create the player in the middle of the arena.  Reduce the scale to
    // better fit the room.
    this.player = this.physics.add.sprite(width / 2, height / 2, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.5);

    // Configure keyboard input.  WASD moves the player.  A mouse click
    // or touch event fires a bullet in the direction of the pointer.
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.input.on('pointerdown', this.shootBullet, this);

    // Pool of bullets.  Bullets are deactivated when they leave the screen or
    // hit an enemy.  Limiting the pool prevents infinite projectiles from
    // degrading performance.
    this.bullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 20,
    });

    // Enemies.  Spawn a handful of zombies at random positions.  Each enemy
    // tracks the player using simple homing behaviour and can absorb a
    // couple of hits before dying.
    this.enemies = this.physics.add.group();
    for (let i = 0; i < 5; i++) {
      const ex = Phaser.Math.Between(50, width - 50);
      const ey = Phaser.Math.Between(50, height - 50);
      const enemy = this.enemies.create(ex, ey, 'enemy');
      enemy.setScale(0.4);
      enemy.setCollideWorldBounds(true);
      enemy.health = 2;
    }

    // Items.  Hearts restore health when collected.  Spread a few around
    // the room at random.  Items do not move.
    this.items = this.physics.add.group();
    for (let i = 0; i < 3; i++) {
      const ix = Phaser.Math.Between(50, width - 50);
      const iy = Phaser.Math.Between(50, height - 50);
      const item = this.items.create(ix, iy, 'heart');
      item.setScale(2);
      item.setRotation(0);
    }

    // Collision handlers.  Overlaps trigger callbacks.
    this.physics.add.overlap(this.bullets, this.enemies, this.handleBulletEnemyCollision, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.handlePlayerEnemyCollision, null, this);
    this.physics.add.overlap(this.player, this.items, this.handleItemPickup, null, this);

    // Draw the health bar.
    this.renderHealth();
  }

  update() {
    const { width, height } = this.scale;
    // Reset player velocity before applying directional input.  Arcade physics
    // uses velocity rather than position for movement.
    this.player.setVelocity(0);
    const speed = 150;
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
    }
    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-speed);
    } else if (this.cursors.down.isDown) {
      this.player.setVelocityY(speed);
    }

    // Rotate the player to face the pointer.  Add π/2 because our sprite
    // faces downward by default in the asset.
    const pointer = this.input.activePointer;
    const angleToPointer = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    );
    this.player.setRotation(angleToPointer + Math.PI / 2);

    // Homing enemies: steer towards the player.  Each enemy rotates to
    // face the player as it moves.
    this.enemies.children.iterate((enemy) => {
      if (!enemy.active) return;
      const eAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const eSpeed = 50;
      enemy.setVelocity(Math.cos(eAngle) * eSpeed, Math.sin(eAngle) * eSpeed);
      enemy.setRotation(eAngle + Math.PI / 2);
    });

    // Update bullets: remove those that leave the screen and rotate them
    // according to their velocity.  Without this cleanup the bullet pool
    // would fill up and stop spawning new projectiles.
    this.bullets.children.iterate((bullet) => {
      if (!bullet.active) return;
      // Out of bounds check with padding so bullets vanish after
      // completely leaving the viewport.
      if (
        bullet.x < -50 ||
        bullet.x > width + 50 ||
        bullet.y < -50 ||
        bullet.y > height + 50
      ) {
        bullet.disableBody(true, true);
        return;
      }
      const bVel = bullet.body.velocity;
      const bAngle = Math.atan2(bVel.y, bVel.x);
      bullet.setRotation(bAngle + Math.PI / 2);
    });
  }

  shootBullet(pointer) {
    // Spawn a bullet if one is available in the pool.  The bullet is
    // positioned at the player's centre and travels towards the pointer.
    const bullet = this.bullets.get(this.player.x, this.player.y);
    if (!bullet) {
      return;
    }
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setScale(1.5);
    bullet.body.reset(this.player.x, this.player.y);
    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    );
    const speed = 400;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setRotation(angle + Math.PI / 2);
  }

  handleBulletEnemyCollision(bullet, enemy) {
    // Deactivate the bullet and reduce the enemy's health.  Destroy the
    // enemy when it runs out of health.
    bullet.disableBody(true, true);
    enemy.health -= 1;
    if (enemy.health <= 0) {
      enemy.disableBody(true, true);
    }
  }

  handlePlayerEnemyCollision(player, enemy) {
    // Only apply damage if the enemy is alive.  This prevents rapid
    // multiple hits from a single overlapping frame.
    if (!enemy.active) return;
    this.health -= 1;
    if (this.health < 0) {
      this.health = 0;
    }
    this.renderHealth();
    // Knock the player back slightly for visual feedback.
    const knockbackAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const force = 200;
    player.body.velocity.x = Math.cos(knockbackAngle) * force;
    player.body.velocity.y = Math.sin(knockbackAngle) * force;
  }

  handleItemPickup(player, item) {
    // Remove the heart and restore one health point, up to the maximum.
    item.disableBody(true, true);
    if (this.health < this.maxHealth) {
      this.health += 1;
      this.renderHealth();
    }
  }

  renderHealth() {
    // Destroy previously drawn hearts.  Keep track of each icon so it can
    // be cleaned up properly.
    if (this.healthIcons) {
      this.healthIcons.forEach((icon) => {
        if (icon && icon.destroy) icon.destroy();
      });
    }
    this.healthIcons = [];
    const heartSpacing = 32;
    for (let i = 0; i < this.maxHealth; i++) {
      const x = 16 + i * heartSpacing;
      const y = 16;
      const icon = this.add.image(x, y, 'heart');
      icon.setScale(1.0);
      // If the heart slot exceeds current health, render it semi‑transparent.
      if (i >= this.health) {
        icon.setAlpha(0.25);
      }
      this.healthIcons.push(icon);
    }
  }
}

// Configure the Phaser game instance.  A fixed resolution keeps the
// experience consistent across devices.  Gravity is disabled because
// top‑down games simulate movement directly via velocity vectors.
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: MainScene,
};

// Kick everything off!
const game = new Phaser.Game(config);