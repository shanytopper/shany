// Extended rogue‑lite demo with procedural rooms, multiple enemy types and modular code architecture.
//
// This implementation builds on the basic POC by adding:
// 1) A sequence of procedurally generated rooms.  Each room contains a random assortment
//    of enemy types and items.  Once all enemies are cleared a door appears that
//    transports the player to the next room.  After the final room the player wins.
// 2) Two enemy varieties: standard chasers and shooters.  Chasers home in on the player,
//    while shooters maintain distance and fire projectiles.  Enemies track their own
//    health values and behaviours.
// 3) A lightweight object‑oriented architecture.  Players, enemies, projectiles and rooms
//    are encapsulated into classes to improve organisation and readability.  The main
//    scene orchestrates interactions and progression through rooms.

class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * Create a new player.  The player is a physics‑enabled sprite that
   * supports movement, rotation, shooting and temporary speed boosts.
   * @param {Phaser.Scene} scene The scene this player belongs to.
   * @param {number} x Starting x position.
   * @param {number} y Starting y position.
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setScale(0.5);

    // Base movement speed.  Speed can be temporarily increased by power‑ups.
    this.baseSpeed = 150;
    this.speedBoostEnd = 0;

    // Fire rate control.  The player can only shoot once every 200 ms.
    this.shootCooldown = 200;
    this.lastShotTime = 0;
  }

  /**
   * Update the player's movement and rotation each frame.
   * @param {Object} cursors Object containing W/A/S/D keys.
   * @param {Phaser.Input.Pointer} pointer Pointer for aiming.
   * @param {number} time The current game time in ms.
   */
  update(cursors, pointer, time) {
    // Reset velocity.
    this.setVelocity(0);
    // Determine current speed (boosted if active).
    let speed = this.baseSpeed;
    if (time < this.speedBoostEnd) {
      speed = this.baseSpeed * 1.8;
    }
    // Movement input.
    if (cursors.left.isDown) {
      this.setVelocityX(-speed);
    } else if (cursors.right.isDown) {
      this.setVelocityX(speed);
    }
    if (cursors.up.isDown) {
      this.setVelocityY(-speed);
    } else if (cursors.down.isDown) {
      this.setVelocityY(speed);
    }
    // Rotate to face pointer.
    const angle = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);
    this.setRotation(angle + Math.PI / 2);
  }

  /**
   * Attempt to fire a bullet toward the pointer.  If the cooldown has not
   * elapsed no bullet will be created.
   * @param {Phaser.Input.Pointer} pointer
   * @param {Phaser.Physics.Arcade.Group} bulletGroup Group to retrieve bullets from.
   * @param {number} time Current timestamp.
   */
  tryShoot(pointer, bulletGroup, time) {
    if (time - this.lastShotTime < this.shootCooldown) {
      return;
    }
    this.lastShotTime = time;
    // Acquire a bullet from the pool.
    const bullet = bulletGroup.get(this.x, this.y);
    if (!bullet) return;
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body.enable = true;
    bullet.body.reset(this.x, this.y);

    // Avoid near‑zero distance shots which would appear stuck.
    const dx = pointer.worldX - this.x;
    const dy = pointer.worldY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) {
      bullet.disableBody(true, true);
      return;
    }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, pointer.worldX, pointer.worldY);
    const speed = 400;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setRotation(angle + Math.PI / 2);
  }

  /**
   * Apply a temporary speed boost for a fixed duration.
   * @param {number} duration Duration of the boost in ms.
   * @param {number} currentTime Current timestamp.
   */
  addSpeedBoost(duration, currentTime) {
    this.speedBoostEnd = currentTime + duration;
  }
}

/**
 * Base class for enemies.  Enemies extend Phaser.Physics.Arcade.Sprite and
 * include health, type and general update logic.  Specific behaviours
 * are implemented in subclasses.
 */
class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(0.4);
    this.setCollideWorldBounds(true);
    // Enemies have a default amount of health.  Subclasses may adjust this.
    this.maxHealth = 2;
    this.health = this.maxHealth;
    // Track what type this enemy is for AI branching.
    this.enemyType = 'chaser';
  }

  /**
   * Called every frame to update the enemy.  Base enemies have no
   * independent behaviour and simply remain still.  Subclasses override this.
   * @param {MainScene} scene
   */
  update(scene) {
    // Default: do nothing.
  }

  /**
   * Apply damage to this enemy.  When health reaches zero the enemy is
   * deactivated and removed from physics simulations.
   * @param {number} amount Amount of damage to apply.
   */
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.disableBody(true, true);
    }
  }
}

/**
 * Enemy that chases the player by moving directly toward them.
 */
class ChaserEnemy extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y);
    this.enemyType = 'chaser';
  }

  update(scene) {
    if (!this.active) return;
    // Move toward the player.
    const target = scene.player;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const speed = 60;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.setRotation(angle + Math.PI / 2);
  }
}

/**
 * Enemy that occasionally shoots bullets at the player while slowly
 * approaching.  Shooters maintain a lower speed and keep track of a
 * cooldown timer for firing projectiles.
 */
class ShooterEnemy extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y);
    this.enemyType = 'shooter';
    // Shooters have a bit more health than chasers.
    this.maxHealth = 3;
    this.health = this.maxHealth;
    // Shooting interval in ms.  A random offset is applied to avoid synchronous firing.
    this.shootInterval = Phaser.Math.Between(1200, 1800);
    this.lastShotTime = 0;
  }

  update(scene, time) {
    if (!this.active) return;
    const target = scene.player;
    // Move slowly toward the player.
    const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    const speed = 40;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.setRotation(angle + Math.PI / 2);
    // Fire at the player if the cooldown has elapsed.
    if (time - this.lastShotTime > this.shootInterval) {
      this.lastShotTime = time;
      // Acquire bullet from enemy bullet group.
      const eBullet = scene.enemyBullets.get(this.x, this.y);
      if (eBullet) {
        eBullet.setActive(true);
        eBullet.setVisible(true);
        eBullet.body.enable = true;
        eBullet.body.reset(this.x, this.y);
        const bAngle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        const bSpeed = 250;
        eBullet.setVelocity(Math.cos(bAngle) * bSpeed, Math.sin(bAngle) * bSpeed);
        // Tint enemy bullets red for clarity.
        eBullet.setTint(0xff3333);
        eBullet.setRotation(bAngle + Math.PI / 2);
      }
    }
  }
}

/**
 * Pickup items.  Items grant health or temporary boosts when collected.
 * Different item types are distinguished by the `itemType` property.
 */
class Pickup extends Phaser.Physics.Arcade.Sprite {
  /**
   * Create a new pickup item.
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} itemType 'heart' restores health; 'speed' grants a speed boost.
   */
  constructor(scene, x, y, itemType) {
    const texture = itemType === 'heart' ? 'heart' : 'heart';
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.itemType = itemType;
    // Scale items for visibility.
    this.setScale(itemType === 'heart' ? 2.0 : 2.0);
    // Apply tint to differentiate items.
    if (itemType === 'speed') {
      this.setTint(0x44bbff);
    }
  }
}

/**
 * A Door transports the player to the next room when touched.  It
 * remains invisible until spawned.
 */
class Door extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'heart'); // use heart texture as placeholder; tinted
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // static body
    this.setScale(2.5);
    this.setTint(0x88ff88);
    this.setVisible(false);
    this.setActive(false);
  }

  /**
   * Show the door at a position.  Static bodies require their physics
   * body to be reset when moving.
   */
  open(x, y) {
    this.setPosition(x, y);
    this.setActive(true);
    this.setVisible(true);
    this.body.enable = true;
  }

  /**
   * Hide the door.
   */
  close() {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }
}

/**
 * A Room describes the contents of a play area.  Rooms spawn enemies and
 * items based on configuration and notify the scene when they are cleared.
 */
class Room {
  /**
   * Create a new room definition.
   * @param {MainScene} scene
   * @param {Object} config Configuration object specifying enemies and pickups.
   * @param {Object} config.enemies Object with counts of each enemy type (e.g., {chaser: 5, shooter: 2}).
   * @param {Array<string>} config.items List of item types to spawn (e.g., ['heart','speed']).
   */
  constructor(scene, config) {
    this.scene = scene;
    this.config = config;
    this.enemies = [];
    this.pickups = [];
  }

  /**
   * Spawn this room's contents at random positions.  Positions are
   * generated to avoid overlap with the player.
   */
  spawn() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    // Spawn enemies by type.
    const enemyTypes = this.config.enemies || {};
    Object.entries(enemyTypes).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) {
        let x, y;
        let attempts = 0;
        do {
          x = Phaser.Math.Between(50, width - 50);
          y = Phaser.Math.Between(50, height - 50);
          attempts++;
        } while (
          Phaser.Math.Distance.Between(x, y, this.scene.player.x, this.scene.player.y) < 200 &&
          attempts < 20
        );
        let enemy;
        if (type === 'shooter') {
          enemy = new ShooterEnemy(this.scene, x, y);
        } else {
          enemy = new ChaserEnemy(this.scene, x, y);
        }
        this.enemies.push(enemy);
        this.scene.enemies.add(enemy);
      }
    });
    // Spawn pickups.
    (this.config.items || []).forEach((itemType) => {
      let x, y;
      let attempts = 0;
      do {
        x = Phaser.Math.Between(50, width - 50);
        y = Phaser.Math.Between(50, height - 50);
        attempts++;
      } while (
        Phaser.Math.Distance.Between(x, y, this.scene.player.x, this.scene.player.y) < 150 &&
        attempts < 20
      );
      const pickup = new Pickup(this.scene, x, y, itemType);
      this.pickups.push(pickup);
      this.scene.items.add(pickup);
    });
  }

  /**
   * Clean up all sprites belonging to this room.  Called when transitioning
   * to the next room.
   */
  destroy() {
    this.enemies.forEach((enemy) => {
      enemy.destroy();
    });
    this.pickups.forEach((pickup) => {
      pickup.destroy();
    });
    this.enemies = [];
    this.pickups = [];
  }
}

/**
 * MainScene orchestrates the entire game: loading assets, spawning rooms,
 * managing collisions and handling progression.  It maintains global
 * references to the player, rooms, bullets and UI elements.
 */
class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.player = null;
    this.playerBullets = null;
    this.enemyBullets = null;
    this.enemies = null;
    this.items = null;
    this.doors = null;
    this.rooms = [];
    this.currentRoomIndex = 0;
    this.currentRoom = null;
    this.cursors = null;
    // Health counters.
    this.maxHealth = 3;
    this.health = 3;
    this.healthIcons = [];
    // Game state flags.
    this.gameOver = false;
    this.victory = false;
  }

  preload() {
    // Base assets.
    this.load.image('player', 'assets/player.png');
    this.load.image('bullet', 'assets/bullet.png');
    this.load.image('enemy', 'assets/enemy.png');
    this.load.image('floor', 'assets/floor.png');
    this.load.image('heart', 'assets/item.png');
    // Additional assets could be loaded here (e.g., different textures), but
    // for simplicity we reuse existing images and tint them for variety.
  }

  create() {
    const { width, height } = this.scale;

    // Create a tiled background floor.
    this.floor = this.add.tileSprite(0, 0, width, height, 'floor')
      .setOrigin(0, 0);

    // World bounds restrict movement to the play area.
    this.physics.world.setBounds(0, 0, width, height);

    // Instantiate the player at the centre.
    this.player = new Player(this, width / 2, height / 2);

    // Input setup.
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.input.on('pointerdown', (pointer) => {
      this.player.tryShoot(pointer, this.playerBullets, this.time.now);
    });

    // Groups for bullets and entities.
    this.playerBullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 30,
    });
    this.enemyBullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 30,
    });
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();
    this.doors = this.physics.add.staticGroup();

    // Initialize health UI.
    this.renderHealth();

    // Build a list of rooms with varied compositions.  The last entry has
    // no enemies; clearing it triggers the victory condition immediately.
    this.rooms = [
      new Room(this, { enemies: { chaser: 4, shooter: 0 }, items: ['heart', 'speed'] }),
      new Room(this, { enemies: { chaser: 5, shooter: 1 }, items: ['heart'] }),
      new Room(this, { enemies: { chaser: 6, shooter: 2 }, items: ['heart', 'speed'] }),
      new Room(this, { enemies: { chaser: 7, shooter: 3 }, items: ['heart'] }),
      new Room(this, { enemies: { chaser: 0, shooter: 0 }, items: [] }),
    ];

    // Spawn the first room.
    this.loadCurrentRoom();

    // Door instance: a single door reused across rooms.  Initially hidden.
    this.door = new Door(this, width / 2, height - 80);
    this.doors.add(this.door);

    // Collision handlers.
    // Player bullets damage enemies.
    this.physics.add.overlap(this.playerBullets, this.enemies, (bullet, enemy) => {
      bullet.disableBody(true, true);
      enemy.takeDamage(1);
      // When all enemies are gone and room is cleared, spawn the door.
      if (!this.victory && this.enemies.countActive(true) === 0 && this.currentRoomIndex < this.rooms.length - 1) {
        // Delay door spawn slightly so the last enemy can finish dying.
        this.time.delayedCall(300, () => {
          this.spawnDoor();
        });
      }
    });
    // Enemy bullets damage the player.
    this.physics.add.overlap(this.enemyBullets, this.player, (bullet, player) => {
      bullet.disableBody(true, true);
      this.applyPlayerDamage(1);
    });
    // Player colliding with enemies directly also deals damage.
    this.physics.add.overlap(this.player, this.enemies, (player, enemy) => {
      if (!enemy.active) return;
      this.applyPlayerDamage(1);
      enemy.disableBody(true, true);
    });
    // Pickup collection.
    this.physics.add.overlap(this.player, this.items, (player, item) => {
      this.collectItem(item);
    });
    // Door passage to next room.
    this.physics.add.overlap(this.player, this.doors, () => {
      if (this.door.active && !this.gameOver && !this.victory) {
        this.advanceRoom();
      }
    });
  }

  /**
   * Spawn the current room's contents.
   */
  loadCurrentRoom() {
    if (this.currentRoom) {
      this.currentRoom.destroy();
    }
    // Ensure player is centred when entering new rooms.
    this.player.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.currentRoom = this.rooms[this.currentRoomIndex];
    this.currentRoom.spawn();
    // Hide the door until the room is cleared.
    this.door.close();
  }

  /**
   * Spawn the door at the bottom of the arena.
   */
  spawnDoor() {
    const x = this.scale.width / 2;
    const y = this.scale.height - 80;
    this.door.open(x, y);
  }

  /**
   * Transition to the next room.  If there are no more rooms the player wins.
   */
  advanceRoom() {
    // Remove items and enemies from current room.
    this.currentRoom.destroy();
    // Hide door.
    this.door.close();
    this.currentRoomIndex++;
    if (this.currentRoomIndex >= this.rooms.length) {
      // Player wins.
      if (!this.victory) {
        this.victory = true;
        this.physics.pause();
        this.player.setTint(0x00ff00);
        this.add
          .text(this.scale.width / 2, this.scale.height / 2, 'You Win!', {
            fontSize: '48px',
            fill: '#44ff44',
            stroke: '#000',
            strokeThickness: 4,
          })
          .setOrigin(0.5);
      }
      return;
    }
    // Load the next room.
    this.loadCurrentRoom();
  }

  /**
   * Apply damage to the player and check for game over.
   * @param {number} amount
   */
  applyPlayerDamage(amount) {
    if (this.gameOver || this.victory) return;
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    this.renderHealth();
    if (this.health <= 0) {
      this.handleGameOver();
    }
  }

  /**
   * Handle item collection.  Different item types trigger different effects.
   * @param {Pickup} item
   */
  collectItem(item) {
    if (!item.active) return;
    item.disableBody(true, true);
    if (item.itemType === 'heart') {
      // Restore one heart.
      if (this.health < this.maxHealth) {
        this.health += 1;
        this.renderHealth();
      }
    } else if (item.itemType === 'speed') {
      // Grant a speed boost for 4 seconds.
      this.player.addSpeedBoost(4000, this.time.now);
    }
  }

  /**
   * Game over logic.  Freeze physics and display a message.
   */
  handleGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.physics.pause();
    this.player.setTint(0xff0000);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Game Over', {
        fontSize: '48px',
        fill: '#ff4444',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  /**
   * Draw the health bar as a row of hearts in the top left.
   */
  renderHealth() {
    // Clean up previous icons.
    if (this.healthIcons) {
      this.healthIcons.forEach((icon) => {
        if (icon && icon.destroy) icon.destroy();
      });
    }
    this.healthIcons = [];
    const spacing = 32;
    for (let i = 0; i < this.maxHealth; i++) {
      const x = 16 + i * spacing;
      const y = 16;
      const icon = this.add.image(x, y, 'heart');
      icon.setScale(1.0);
      if (i >= this.health) {
        icon.setAlpha(0.25);
      }
      this.healthIcons.push(icon);
    }
  }

  update(time, delta) {
    if (this.gameOver || this.victory) return;
    // Update player movement and rotation.
    this.player.update(this.cursors, this.input.activePointer, time);
    // Update enemies.  Pass current time to shooter enemies.
    this.enemies.children.iterate((enemy) => {
      if (enemy.update) {
        enemy.update(this, time);
      }
    });
    // Cleanup bullets that leave the arena.
    const width = this.scale.width;
    const height = this.scale.height;
    this.playerBullets.children.iterate((bullet) => {
      if (!bullet.active) return;
      if (
        bullet.x < -50 ||
        bullet.x > width + 50 ||
        bullet.y < -50 ||
        bullet.y > height + 50
      ) {
        bullet.disableBody(true, true);
      } else {
        const bVel = bullet.body.velocity;
        const bAngle = Math.atan2(bVel.y, bVel.x);
        bullet.setRotation(bAngle + Math.PI / 2);
      }
    });
    // Cleanup enemy bullets as well.
    this.enemyBullets.children.iterate((bullet) => {
      if (!bullet.active) return;
      if (
        bullet.x < -50 ||
        bullet.x > width + 50 ||
        bullet.y < -50 ||
        bullet.y > height + 50
      ) {
        bullet.disableBody(true, true);
      } else {
        const bVel = bullet.body.velocity;
        const bAngle = Math.atan2(bVel.y, bVel.x);
        bullet.setRotation(bAngle + Math.PI / 2);
      }
    });
  }
}

// Game configuration.
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

const game = new Phaser.Game(config);