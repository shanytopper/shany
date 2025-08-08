// Simple UI scene showing player health and enemy count.
const Phaser = globalThis.Phaser;

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.label = this.add.text(8, 8, 'HP: 0  Enemies: 0', { fontFamily: 'monospace', fontSize: 16, color: '#ffffff' });
    this.label.setScrollFactor(0);
    const dungeon = this.scene.get('DungeonScene');
    this.dungeon = dungeon;
    // Refresh UI periodically
    this.time.addEvent({ delay: 100, loop: true, callback: () => this.refresh(), callbackScope: this });
  }

  refresh() {
    const player = this.dungeon.player;
    if (!player) return;
    const hp = player.health;
    const enemies = this.dungeon.enemies.getChildren().filter((e) => e.active).length;
    this.label.setText(`HP: ${hp}  Enemies: ${enemies}`);
  }
}