// The BootScene preloads assets and generates simple textures.
const Phaser = globalThis.Phaser;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load our custom dungeon tile. This can be used for floors and walls.
    this.load.image('dungeon_tile', 'assets/dungeon_tile.png');

    // Load sprite sheets for the player and enemy. Each sheet is laid out in
    // three columns by four rows, with each cell 16x16 pixels. Using
    // spritesheets allows us to create walking animations in different
    // directions (down, up, left, right) and animate the enemy.
    this.load.spritesheet('player', 'assets/player_spritesheet.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('enemy', 'assets/enemy_spritesheet.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create() {
    // Generate simple textures for bullets and doors. We continue to use
    // procedural textures for these objects since they are very small and
    // easier to define inline. The player and enemy textures are now
    // provided by loaded spritesheets.
    this.textures.generate('bullet', {
      // Generate a larger bullet sprite by increasing pixel size. A single
      // character 'F' will produce a 4x4 square bullet, making it easier to
      // see when fired across the room.
      data: ['F'],
      pixelWidth: 4,
      pixelHeight: 4,
      palette: { F: '#f5e663' },
    });
    this.textures.generate('door', {
      data: ['5555', '5665', '5665', '5665', '5665', '5555'],
      pixelWidth: 2,
      pixelHeight: 2,
      palette: { '5': '#444444', '6': '#888888' },
    });

    // Define animations for the player. The spritesheet has four rows of
    // animations: row 0 (frames 0-2) faces down, row 1 (frames 3-5) faces up,
    // row 2 (frames 6-8) faces left, and row 3 (frames 9-11) faces right.
    this.anims.create({
      key: 'player-down',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 2 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'player-up',
      frames: this.anims.generateFrameNumbers('player', { start: 3, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'player-left',
      frames: this.anims.generateFrameNumbers('player', { start: 6, end: 8 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'player-right',
      frames: this.anims.generateFrameNumbers('player', { start: 9, end: 11 }),
      frameRate: 8,
      repeat: -1,
    });

    // Define a simple walk animation for the enemy. We will reuse the first
    // three frames (row 0) for all movement directions and flip the sprite
    // horizontally when moving left in the enemy update method.
    this.anims.create({
      key: 'enemy-walk',
      frames: this.anims.generateFrameNumbers('enemy', { start: 0, end: 2 }),
      frameRate: 6,
      repeat: -1,
    });

    // When the assets and animations are ready, move immediately to the
    // dungeon scene.
    this.scene.start('DungeonScene');
  }
}