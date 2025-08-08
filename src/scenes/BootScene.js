// The BootScene preloads assets and generates simple textures.
const Phaser = globalThis.Phaser;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load our custom dungeon tile. This can be used for floors and walls.
    this.load.image('dungeon_tile', 'assets/dungeon_tile.png');
  }

  create() {
    // Generate placeholder textures for player, enemy, bullet and doors using
    // simple shapes. These can be replaced later with proper sprites.
    this.textures.generate('player', {
      data: ['  11  ', ' 1111 ', '111111', '111111', ' 1111 ', '  11  '],
      pixelWidth: 2,
      pixelHeight: 2,
      palette: { '1': '#c1e7ff' },
    });
    this.textures.generate('enemy', {
      data: ['222222', '266662', '266662', '266662', '266662', '222222'],
      pixelWidth: 2,
      pixelHeight: 2,
      palette: { '2': '#ba4141', '6': '#ff7777' },
    });
    this.textures.generate('bullet', {
      data: ['F'],
      pixelWidth: 1,
      pixelHeight: 1,
      palette: { F: '#f5e663' },
    });
    this.textures.generate('door', {
      data: ['5555', '5665', '5665', '5665', '5665', '5555'],
      pixelWidth: 2,
      pixelHeight: 2,
      palette: { '5': '#444444', '6': '#888888' },
    });
    // Move immediately to the DungeonScene when assets are ready
    this.scene.start('DungeonScene');
  }
}