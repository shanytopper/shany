// Entry point for the roguelike POC.  Sets up the Phaser game configuration
// and launches the GameScene.  Use ES modules to organize code into
// separate files for manageability.
import GameScene from './gameScene.js';

// Define the game configuration.  We set a fixed size of 800×600 and use
// arcade physics.  The debug flag can be toggled to true when tuning
// collision boxes and behaviours.
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: null,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [GameScene]
};

// Create the Phaser game instance.  The game will automatically boot and
// transition into the GameScene defined above.
const game = new Phaser.Game(config);
export default game;