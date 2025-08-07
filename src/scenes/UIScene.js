import Phaser from 'phaser'

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene')
  }

  create() {
    this.label = this.add.text(8, 8, 'HP: 0  Enemies: 0', { fontFamily: 'monospace', fontSize: 16, color: '#ffffff' })
    this.label.setScrollFactor(0)

    const dungeon = this.scene.get('DungeonScene')
    this.dungeon = dungeon

    this.time.addEvent({ delay: 100, loop: true, callback: () => this.refresh(), callbackScope: this })
  }

  refresh() {
    if (!this.dungeon.player) return
    const hp = this.dungeon.player.health
    const enemies = this.dungeon.enemies?.getChildren().filter((e) => e.active).length ?? 0
    this.label.setText(`HP: ${hp}  Enemies: ${enemies}`)
  }
}