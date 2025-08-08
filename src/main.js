// Entry point for the roguelite proof‑of‑concept

import { BootScene } from './scenes/BootScene.js';
import { DungeonScene } from './scenes/DungeonScene.js';
import { UIScene } from './scenes/UIScene.js';

// Grab Phaser from the global namespace (loaded via a <script> tag in index.html)
const Phaser = globalThis.Phaser;

const WIDTH = 960;
const HEIGHT = 540;

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
      debug: false,
    },
  },
  scene: [BootScene, DungeonScene, UIScene],
};

// Create and launch the game
new Phaser.Game(config);