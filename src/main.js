import Phaser from '../node_modules/phaser/dist/phaser.js'
import { BootScene } from './scenes/BootScene.js'
import { DungeonScene } from './scenes/DungeonScene.js'
import { UIScene } from './scenes/UIScene.js'

const WIDTH = 960
const HEIGHT = 540

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [BootScene, DungeonScene, UIScene]
}

new Phaser.Game(config)
