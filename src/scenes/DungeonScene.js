// The DungeonScene manages room transitions, spawning, and core gameplay.
const Phaser = globalThis.Phaser;

import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';

export class DungeonScene extends Phaser.Scene {
  constructor() {
    super('DungeonScene');
    this.rooms = [];
    this.currentRoomIndex = 0;
    this.visitedRooms = new Set();
  }

  create() {
    // Create a group to hold objects for cleanup between rooms
    this.roomObjects = this.add.group();
    // Physics groups
    this.walls = this.physics.add.staticGroup();
    // Use a physics-enabled group for enemies so they automatically
    // participate in collisions and physics updates.
    this.enemies = this.physics.add.group();

    // Instantiate the player in the center of the scene
    this.player = new Player(this, this.scale.width / 2, this.scale.height / 2);
    this.player.setDepth(10);
    // Set camera to follow the player
    this.cameras.main.startFollow(this.player);

    // Create a crosshair sprite for aiming feedback. It will follow the
    // mouse pointer when the button is held down. We set a high depth so
    // it renders above other objects.
    this.crosshair = this.add.image(0, 0, 'crosshair');
    this.crosshair.setDepth(25);
    this.crosshair.setVisible(false);

    // Define rooms for the POC
    // Each room has a spawn function invoked on first entry
    this.rooms = [
      {
        id: 'start',
        spawn: () => {
          // No enemies in start room
        },
      },
      {
        id: 'combat',
        spawn: () => {
          for (let i = 0; i < 5; i++) {
            const x = Phaser.Math.Between(200, this.scale.width - 200);
            const y = Phaser.Math.Between(100, this.scale.height - 100);
            const enemy = new Enemy(this, x, y);
            this.enemies.add(enemy);
          }
        },
      },
    ];

    // Build the initial room
    this.loadRoom(this.currentRoomIndex);

    // Player bullet vs. enemy collision
    this.physics.add.overlap(
      this.player.bullets,
      this.enemies,
      (bullet, enemy) => {
        bullet.destroy();
        enemy.takeDamage(1);
      }
    );
    // Player vs. enemy collision
    this.physics.add.collider(
      this.player,
      this.enemies,
      (player, enemy) => {
        player.takeDamage(1);
      }
    );
  }

  loadRoom(index) {
    // Clear existing room objects
    this.roomObjects.clear(true, true);
    this.walls.clear(true, true);
    this.enemies.clear(true, true);

    this.currentRoomIndex = index;
    const room = this.rooms[index];

    // Build floor using a tileSprite that repeats our dungeon tile
    // Increase the tile size to 32 pixels so that the floor and walls appear
    // larger on screen and are easier to see.
    const tileSize = 32;
    const cols = Math.ceil(this.scale.width / tileSize);
    const rows = Math.ceil(this.scale.height / tileSize);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const tile = this.add.image(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, 'dungeon_tile');
        tile.setDisplaySize(tileSize, tileSize);
        tile.setDepth(0);
        this.roomObjects.add(tile);
      }
    }

    // Create border walls
    const wallThickness = 32;
    // Top and bottom
    const top = this.add.rectangle(this.scale.width / 2, wallThickness / 2, this.scale.width, wallThickness, 0x222222);
    const bottom = this.add.rectangle(this.scale.width / 2, this.scale.height - wallThickness / 2, this.scale.width, wallThickness, 0x222222);
    // Left and right
    const left = this.add.rectangle(wallThickness / 2, this.scale.height / 2, wallThickness, this.scale.height, 0x222222);
    const right = this.add.rectangle(this.scale.width - wallThickness / 2, this.scale.height / 2, wallThickness, this.scale.height, 0x222222);
    [top, bottom, left, right].forEach((rect) => {
      this.walls.add(rect);
    });
    this.roomObjects.addMultiple([top, bottom, left, right]);

    // Spawn the room’s enemies if first time visiting
    if (!this.visitedRooms.has(room.id)) {
      room.spawn();
    }
    this.visitedRooms.add(room.id);

    // Reset player position to center
    this.player.setPosition(this.scale.width / 2, this.scale.height / 2);
    // Collide player and enemies with walls
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.enemies, this.walls);

    // Setup door interactivity: For the POC we add a door on the right side
    // In room 0, door leads to room 1; in room 1, door leads back to 0
    const doorX = this.scale.width - wallThickness - 20;
    const doorY = this.scale.height / 2;
    const door = this.add.image(doorX, doorY, 'door');
    door.setInteractive();
    door.on('pointerdown', () => {
      // Only allow exit if enemies are cleared
      if (this.enemies.countActive(true) === 0) {
        const nextIndex = index === 0 ? 1 : 0;
        this.loadRoom(nextIndex);
      }
    });
    this.roomObjects.add(door);
  }

  update(time, delta) {
    this.player.update(time);
    // Remove bullets that have expired
    const now = this.time.now;
    this.player.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      if (now - b.spawnedAt > b.lifespanMs) b.destroy();
    });

    // Update enemies to chase the player and handle their animations
    this.enemies.getChildren().forEach((enemy) => {
      enemy.update(this.player);
    });

    // Crosshair visibility and position: show the crosshair when the left
    // mouse button is held down. Position it at the pointer’s world
    // coordinates so that it follows the cursor across the scene. Hide
    // otherwise.
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      this.crosshair.setVisible(true);
      // Convert pointer position to world coordinates accounting for camera
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.crosshair.setPosition(worldPoint.x, worldPoint.y);
    } else {
      this.crosshair.setVisible(false);
    }
  }
}