// GameScene coordinates the overall gameplay: loading assets, creating the player,
// spawning rooms in random order and handling collisions, health and win/lose states.

import Player from './player.js';
import Enemy from './enemy.js';
import Room from './room.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    // Keep track of the current room index and a flag for game over state
    this.currentRoomIndex = -1;
    this.isGameOver = false;
    this.rooms = [];
    this.roomDefinitions = [];
  }

  preload() {
    // Preload assets from the assets folder.  All assets are stored in
    // phaser_game/assets relative to the index.html so paths are resolved
    // relative to the root folder when loaded by Phaser.
    this.load.image('player', 'assets/player.png');
    this.load.image('enemy', 'assets/enemy.png');
    this.load.image('bullet', 'assets/bullet.png');
    this.load.image('floor', 'assets/floor.png');
    this.load.image('item', 'assets/item.png');
    this.load.image('heartIcon', 'assets/item.png'); // reuse item sprite for UI hearts
  }

  create() {
    // Set world bounds equal to the camera size. Each room will fill this area.
    const width = this.game.config.width;
    const height = this.game.config.height;

    // Create a repeating floor texture covering the entire scene. We tile
    // individual sprites instead of using a TileSprite so we can easily
    // adjust scaling later without heavy performance concerns for a POC.
    const tileSize = 64;
    for (let x = 0; x < width; x += tileSize) {
      for (let y = 0; y < height; y += tileSize) {
        const tile = this.add.image(x, y, 'floor').setOrigin(0, 0);
        // Each floor sprite is 32×32 pixels; scale to 64×64.
        tile.setScale(2);
      }
    }

    // Create groups for bullets, enemies and items.  Bullets are limited in
    // number; when a bullet leaves the screen or hits an enemy it will be
    // disabled and reused later.
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 40,
      runChildUpdate: false
    });
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();

    // Create the player in the centre of the first room.  The player class
    // extends Physics.Arcade.Sprite so it already has a physics body.
    const spawnX = width / 2;
    const spawnY = height / 2;
    this.player = new Player(this, spawnX, spawnY);
    this.player.cursors = this.input.keyboard.addKeys('W,A,S,D');

    // Configure bullet shooting
    this.lastShotTime = 0;
    this.shotCooldown = 200; // milliseconds between shots
    this.input.on('pointerdown', this.shootBullet, this);

    // Create collision handlers
    this.physics.add.overlap(this.bullets, this.enemies, this.handleBulletEnemyCollision, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.handlePlayerEnemyCollision, undefined, this);
    this.physics.add.overlap(this.player, this.items, this.handlePlayerItemCollision, undefined, this);

    // Create the heart UI showing current health. We'll add icons and update
    // them when health changes.  The hearts are 16×16 pixel sprites scaled
    // slightly for visibility.
    this.hearts = [];
    this.updateHeartsDisplay();

    // Define several rooms ahead of time. Each room defines where enemies
    // and items spawn.  The order of rooms will be shuffled when the
    // game starts to provide variety between runs.
    this.roomDefinitions = [
      new Room({
        enemies: [ { x: width * 0.25, y: height * 0.25 }, { x: width * 0.75, y: height * 0.25 }, { x: width * 0.5, y: height * 0.75 } ],
        items: [ { x: width * 0.5, y: height * 0.5 } ]
      }),
      new Room({
        enemies: [ { x: width * 0.3, y: height * 0.6 }, { x: width * 0.7, y: height * 0.6 }, { x: width * 0.5, y: height * 0.3 } ],
        items: []
      }),
      new Room({
        enemies: [ { x: width * 0.2, y: height * 0.8 }, { x: width * 0.8, y: height * 0.8 } ],
        items: [ { x: width * 0.5, y: height * 0.2 } ]
      }),
      new Room({
        enemies: [ { x: width * 0.5, y: height * 0.2 }, { x: width * 0.2, y: height * 0.5 }, { x: width * 0.8, y: height * 0.5 } ],
        items: [ ]
      })
    ];
    // Randomize the order of rooms for this run. Copy the array first to avoid
    // modifying the original definitions if we reset later.
    // Shuffle room order. Use our own shuffle helper to avoid relying on Phaser.Utils.Array.Shuffle
    this.rooms = this.shuffleArray(this.roomDefinitions.slice());
    this.currentRoomIndex = -1;
    // Defer loading the first room slightly so that physics bodies are fully initialised
    this.time.delayedCall(100, () => this.loadNextRoom(), [], this);
  }

  /**
   * Shuffle helper for browsers where Phaser.Utils.Array.Shuffle may not be available.
   * Not currently used because Phaser.Utils.Array.Shuffle exists, but kept here
   * for reference.
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Load the next room in the shuffled list. If there are no more rooms
   * remaining, trigger a win state.
   */
  loadNextRoom() {
    // If the game has ended, do not load further rooms.
    if (this.isGameOver) return;
    this.currentRoomIndex++;
    if (this.currentRoomIndex >= this.rooms.length) {
      this.winGame();
      return;
    }
    // Clear all existing enemies, items and bullets.  Use true flag to
    // destroy children so we don't leak objects.
    this.bullets.clear(true, true);
    this.enemies.clear(true, true);
    this.items.clear(true, true);

    // Reset player to the centre of the room.
    const width = this.game.config.width;
    const height = this.game.config.height;
    this.player.setPosition(width / 2, height / 2);

    // Spawn new enemies and items from the room definition.
    const room = this.rooms[this.currentRoomIndex];
    room.enemies.forEach(pos => {
      const enemy = new Enemy(this, pos.x, pos.y);
      enemy.player = this.player;
      this.enemies.add(enemy);
    });
    room.items.forEach(pos => {
      const item = this.physics.add.image(pos.x, pos.y, 'item');
      item.setScale(1.5);
      this.items.add(item);
    });
  }

  /**
   * Fire a bullet from the player towards the pointer location.  Bullets are
   * pooled; if no inactive bullet is available the shot will be skipped. A
   * cooldown prevents shooting too rapidly.
   * @param {Phaser.Input.Pointer} pointer The pointer causing the event.
   */
  shootBullet(pointer) {
    if (this.isGameOver) return;
    const now = this.time.now;
    if (now - this.lastShotTime < this.shotCooldown) return;
    this.lastShotTime = now;
    const bullet = this.bullets.get();
    if (!bullet) return;
    // Prepare the bullet sprite.  When using physics groups, get() returns
    // either an existing inactive sprite or creates a new one.  We need
    // to reactivate it manually.
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setTexture('bullet');
    bullet.setScale(1.4);
    // Re-enable and reset the physics body before setting velocity
    bullet.body.enable = true;
    bullet.body.reset(this.player.x, this.player.y);
    // Compute direction from player to pointer and normalise
    const dx = pointer.worldX - this.player.x;
    const dy = pointer.worldY - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      // Do not spawn a bullet if clicking on the player; disable and exit
      bullet.disableBody(true, true);
      return;
    }
    const angle = Math.atan2(dy, dx);
    const speed = 420;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    // Rotate bullet sprite so it visually points along its trajectory
    bullet.setRotation(angle + Math.PI / 2);
    // Schedule the bullet to be deactivated after 2 seconds
    this.time.delayedCall(2000, () => {
      if (bullet.active) bullet.disableBody(true, true);
    });
  }

  /**
   * Handle collision between a bullet and an enemy.  Damages the enemy and
   * disables the bullet.  If all enemies are defeated, schedule the next room.
   * @param {Phaser.Physics.Arcade.Image} bullet The bullet sprite.
   * @param {Enemy} enemy The enemy instance.
   */
  handleBulletEnemyCollision(bullet, enemy) {
    enemy.takeDamage(1);
    bullet.disableBody(true, true);
    // If this enemy was destroyed (health reached 0), check if all enemies are dead
    if (!enemy.active && this.enemies.countActive(true) === 0) {
      // Delay moving to next room slightly to allow last enemy to be fully destroyed
      this.time.delayedCall(500, () => this.loadNextRoom(), [], this);
    }
  }

  /**
   * Handle collision between the player and an enemy.  Damages the player,
   * removes the enemy and updates the UI.  If player's health drops to zero
   * trigger a game over.
   */
  handlePlayerEnemyCollision(player, enemy) {
    if (this.isGameOver) return;
    this.player.takeDamage(1);
    this.updateHeartsDisplay();
    enemy.destroy();
    if (this.player.health <= 0) {
      this.gameOver();
    }
  }

  /**
   * Handle collision between the player and an item (heart).  Restores health
   * up to the maximum and removes the item from the scene.
   */
  handlePlayerItemCollision(player, item) {
    if (this.isGameOver) return;
    this.player.heal(1);
    this.updateHeartsDisplay();
    item.destroy();
  }

  /**
   * Update the hearts UI to match the player's current health.
   */
  updateHeartsDisplay() {
    // Remove any existing heart icons
    this.hearts.forEach(icon => icon.destroy());
    this.hearts = [];
    const spacing = 32;
    for (let i = 0; i < this.player.maxHealth; i++) {
      const x = 16 + i * spacing;
      const y = 16;
      const heart = this.add.image(x, y, 'heartIcon').setOrigin(0, 0);
      heart.setScale(1.2);
      if (i >= this.player.health) {
        // Tint empty hearts dark
        heart.setTint(0x333333);
      }
      this.hearts.push(heart);
    }
  }

  /**
   * Called on every frame.  Delegates movement to the player and ensures
   * rotation towards the pointer.  No heavy logic is performed here.
   */
  update() {
    if (this.isGameOver) return;
    // Player movement
    this.player.handleMovement();
    // Rotate player to face the pointer
    const pointer = this.input.activePointer;
    const angle = Math.atan2(pointer.worldY - this.player.y, pointer.worldX - this.player.x);
    this.player.setRotation(angle + Math.PI / 2);
    // Update each enemy's AI
    this.enemies.getChildren().forEach(enemy => {
      if (enemy.update) enemy.update();
    });
  }

  /**
   * Trigger a win state when the player clears all rooms.  Stops physics and
   * displays a victory message.
   */
  winGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.pause();
    const width = this.game.config.width;
    const height = this.game.config.height;
    this.add.text(width / 2, height / 2, 'You Win!', { font: '32px Arial', fill: '#ffffff' }).setOrigin(0.5);
  }

  /**
   * Trigger a game over state when the player's health drops to zero.  Stops
   * physics and displays a message.  Prevents further input handling.
   */
  gameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.pause();
    this.player.setTint(0xff0000);
    const width = this.game.config.width;
    const height = this.game.config.height;
    this.add.text(width / 2, height / 2, 'Game Over', { font: '32px Arial', fill: '#ff0000' }).setOrigin(0.5);
  }
}