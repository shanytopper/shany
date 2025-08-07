import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    // Generate simple textures programmatically to avoid external assets
    this.textures.generate('player', { data: ['2'], pixelWidth: 2, pixelHeight: 2 })
    this.textures.generate('enemy', { data: ['3'], pixelWidth: 2, pixelHeight: 2 })
    this.textures.generate('bullet', { data: ['F'], pixelWidth: 1, pixelHeight: 1 })
    this.textures.generate('wall', { data: ['8'], pixelWidth: 4, pixelHeight: 4 })
    this.textures.generate('floor', { data: ['1'], pixelWidth: 4, pixelHeight: 4 })
    this.textures.generate('pickup', { data: ['C'], pixelWidth: 2, pixelHeight: 2 })
  }

  create() {
    this.scene.start('DungeonScene')
  }
}