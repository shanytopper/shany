// Simple UI scene showing player health and enemy count.
const Phaser = globalThis.Phaser;

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    // Create heart icons to represent player health. We preallocate the
    // maximum number of hearts (6) and toggle their visibility based on
    // current health. Hearts are scaled up for better visibility and
    // anchored to the top-left of the screen.
    this.hearts = [];
    for (let i = 0; i < 6; i++) {
      const heart = this.add.image(8 + i * 12, 8, 'heart');
      heart.setScale(1.5);
      heart.setScrollFactor(0);
      this.hearts.push(heart);
    }
    // Display enemy count below the hearts
    this.label = this.add.text(8, 26, 'Enemies: 0', {
      fontFamily: 'monospace',
      fontSize: 14,
      color: '#ffffff',
    });
    this.label.setScrollFactor(0);
    const dungeon = this.scene.get('DungeonScene');
    this.dungeon = dungeon;
    // Refresh UI periodically
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.refresh(), callbackScope: this });
  }

  refresh() {
    const player = this.dungeon.player;
    if (!player) return;
    // Update hearts visibility based on player health (1 heart per HP)
    const hp = player.health;
    for (let i = 0; i < this.hearts.length; i++) {
      this.hearts[i].setVisible(i < hp);
    }
    // Update enemy count label
    const enemies = this.dungeon.enemies.getChildren().filter((e) => e.active).length;
    this.label.setText(`Enemies: ${enemies}`);
  }
}