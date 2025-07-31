// Room class definition for the roguelike POC.
// A Room encapsulates predefined enemy and item spawn positions.  When the room
// is entered, the GameScene will query the Room for these positions and
// instantiate the appropriate game objects.
export default class Room {
  /**
   * Create a new Room instance.
   * @param {Object} definition The room definition. Should contain arrays of
   *   enemy and item positions, e.g. { enemies: [{ x: 400, y: 300 }, ...], items: [...] }.
   */
  constructor(definition = {}) {
    this.enemies = definition.enemies || [];
    this.items = definition.items || [];
  }
}