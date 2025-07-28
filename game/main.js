/*
 * Phaser 3 isometric implementation of the hex grid RPG prototype.
 *
 * Due to connectivity restrictions in this environment we cannot pull
 * in the phaser3‑plugin‑isometric package at runtime.  Instead, this
 * file implements a lightweight isometric projection by hand.  Each
 * axial coordinate (q,r) is converted into a 3‑D Cartesian coordinate
 * (x,y,z) which is then projected into screen space using a classic
 * 2:1 isometric projection.  Tiles and the player store their
 * underlying isoX/isoY/isoZ values and compute their actual screen
 * positions on demand.  This preserves the ability to add height
 * (z‑axis) in the future without any dependency on external plugins.
 */

const GRID_SIZE    = 5;
const HEX_RADIUS   = 50;       // Controls spacing between hex centres
const MOVE_DURATION = 200;      // ms per tile during movement
const ROTATION_STEP = 30;       // degrees to adjust facing when rotating

// Axial direction vectors for pointy‑top hex grid
const directionVectors = {
  left:       { dq: -1, dr:  0 },
  'left-up':  { dq:  0, dr: -1 },
  'right-up': { dq:  1, dr: -1 },
  right:      { dq:  1, dr:  0 },
  'right-down': { dq:  0, dr:  1 },
  'left-down':  { dq: -1, dr:  1 }
};

// Mapping of facing directions to player sprite keys
const spriteMap = {
  right:        'player_right',
  'right-down': 'player_right_down',
  down:         'player_down',
  'left-down':  'player_left_down',
  left:         'player_left',
  'left-up':    'player_left_up',
  up:           'player_up',
  'right-up':   'player_right_up'
};

// Global camera angle used only to determine the displayed sprite direction.
// We no longer rotate the entire grid; the isometric plugin handles
// projection.  However, changing this value will still rotate the
// character’s facing and update the sprite accordingly.
let cameraAngle = 30;

// Player state: axial coordinate and facing direction.
const character = { q: 2, r: 2, facing: 'right', z: 0 };

// Reference to the group of tiles and the player sprite
let isoTiles;
let charSprite;

// Map of axial coordinate keys to tile images.  Useful for positioning
// and interaction during movement.
const tileMap = new Map();

// Define the projection parameters.  The projection angle is the
// classic isometric angle (30°) expressed in radians.  originX and
// originY specify the fraction of the canvas width/height at which the
// grid origin will be drawn.  Adjust originY to control vertical
// centring.  originX=0.5 centres horizontally.
const PROJECTION_ANGLE = Math.atan(0.5);  // ~26.565°
const ORIGIN_X = 0.5;
const ORIGIN_Y = 0.35;

// Canvas dimensions.  Phaser will create a canvas of this size.  If
// you change the config's width or height, update these values as
// well.
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Project a 3‑D point (x,y,z) into 2‑D screen coordinates using the
// classic 2:1 isometric projection.  x and y are horizontal and
// vertical offsets in the grid plane (units in pixels), z controls
// elevation.  The result is offset by the configured origin and
// returned as an object with x and y properties.
function projectIso(x, y, z) {
  // Compute isometric coordinates relative to the origin at (0,0)
  const isoX = (x - y) * Math.cos(PROJECTION_ANGLE);
  const isoY = (x + y) * Math.sin(PROJECTION_ANGLE) - z;
  // Offset by the origin proportions using the global canvas size
  return {
    x: CANVAS_WIDTH * ORIGIN_X + isoX,
    y: CANVAS_HEIGHT * ORIGIN_Y + isoY
  };
}

// Compute a depth value for sorting.  Objects with higher depth are
// rendered above those with lower depth.  Combining isoX, isoY and
// isoZ ensures that taller objects and those further to the front are
// drawn on top.  This heuristic can be tuned as needed.
function computeDepth(x, y, z) {
  return x + y + z * 1000;
}

// Convert axial coordinates (q, r) to 3‑D Cartesian coordinates (x, y, z)
// for the isometric plugin.  The formulas mirror those used in the
// top‑down version but are expressed as x and y in a flat plane; z is
// available for future elevation support.
function axialTo3D(q, r, z = 0) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * 1.5 * r;
  return { x, y, z };
}

// Breadth‑first search on axial coordinates.  Returns an array of
// coordinates (excluding the start) from the start to the goal.
function axialKey(q, r) {
  return `${q},${r}`;
}

function findPath(start, goal) {
  if (start.q === goal.q && start.r === goal.r) {
    return [];
  }
  const queue    = [];
  const visited  = new Set();
  const cameFrom = new Map();
  const startKey = axialKey(start.q, start.r);
  queue.push(start);
  visited.add(startKey);
  cameFrom.set(startKey, null);
  let found = false;
  while (queue.length > 0) {
    const current    = queue.shift();
    const currentKey = axialKey(current.q, current.r);
    if (current.q === goal.q && current.r === goal.r) {
      found = true;
      break;
    }
    for (const dirName in directionVectors) {
      const dir = directionVectors[dirName];
      const nq  = current.q + dir.dq;
      const nr  = current.r + dir.dr;
      // Bound check
      if (nq < 0 || nq >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) continue;
      const key = axialKey(nq, nr);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ q: nq, r: nr });
      cameFrom.set(key, { q: current.q, r: current.r });
    }
  }
  if (!found) return [];
  const path = [];
  let current = { q: goal.q, r: goal.r };
  let key = axialKey(goal.q, goal.r);
  while (key !== startKey) {
    path.unshift({ q: current.q, r: current.r });
    const prev = cameFrom.get(key);
    if (!prev) break;
    current = { q: prev.q, r: prev.r };
    key = axialKey(current.q, current.r);
  }
  return path;
}

// Rotate a 2‑D vector by angleDeg degrees.  Used to determine display direction.
function rotatePoint(x, y, angleDeg) {
  const rad = Phaser.Math.DegToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Determine which sprite orientation should be displayed based on the
// character’s world facing and the camera angle.  Same logic as
// the original top‑down version.
function getDisplayDirection(facing) {
  const vec = directionVectors[facing];
  // Convert axial direction to a pixel vector (unrotated)
  const base = axialTo3D(vec.dq, vec.dr, 0);
  // Rotate by the camera angle to see how it appears on screen
  const rot  = rotatePoint(base.x, base.y, cameraAngle);
  const angle = Math.atan2(rot.y, rot.x);
  // Quantise to the nearest 30° sector and normalise to [-6,6]
  let index = Math.round(angle / (Math.PI / 6));
  if (index > 6) index -= 12;
  if (index < -6) index += 12;
  switch (index) {
    case 0: return 'right';
    case 1:
    case 2: return 'right-down';
    case 3: return 'down';
    case 4:
    case 5: return 'left-down';
    case 6:
    case -6: return 'left';
    case -5:
    case -4: return 'right-up';
    case -3: return 'up';
    case -2:
    case -1: return 'left-up';
    default: return 'right';
  }
}

// Handle tile click.  Compute BFS path and animate movement along it.
function handleTileClick(targetQ, targetR) {
  const path = findPath({ q: character.q, r: character.r }, { q: targetQ, r: targetR });
  if (path.length === 0) return;
  animateMovement.call(this, path);
}

// Animate the character along a path of axial coordinates.  Uses
// Tween to interpolate isoX/Y/Z properties of the IsoSprite.  On
// completion of each tween, recursively animate remaining steps.
function animateMovement(path) {
  if (!path || path.length === 0) return;
  const [step, ...rest] = path;
  const { q, r } = step;
  const targetPos = axialTo3D(q, r, 0);
  const prevQ = character.q;
  const prevR = character.r;
  this.tweens.add({
    targets: charSprite,
    isoX: targetPos.x,
    isoY: targetPos.y,
    isoZ: targetPos.z,
    duration: MOVE_DURATION,
    ease: 'Linear',
    onStart: () => {
      // Determine movement delta
      const dq = q - prevQ;
      const dr = r - prevR;
      // Update character axial position
      character.q = q;
      character.r = r;
      // Update world facing based on movement delta
      if (dq === -1 && dr === 0) character.facing = 'left';
      else if (dq === 0 && dr === -1) character.facing = 'left-up';
      else if (dq === 1 && dr === -1) character.facing = 'right-up';
      else if (dq === 1 && dr === 0) character.facing = 'right';
      else if (dq === 0 && dr === 1) character.facing = 'right-down';
      else if (dq === -1 && dr === 1) character.facing = 'left-down';
      // Update the displayed sprite
      updateCharacterSprite.call(this);
    },
    onUpdate: () => {
      // Compute projected screen coordinates based on current isoX/Y/Z
      const screen = projectIso(charSprite.isoX, charSprite.isoY, charSprite.isoZ);
      charSprite.x = screen.x;
      charSprite.y = screen.y;
      charSprite.depth = computeDepth(charSprite.isoX, charSprite.isoY, charSprite.isoZ) + 1000;
    },
    onComplete: () => {
      animateMovement.call(this, rest);
    }
  });
}

// Update the player sprite texture according to the current camera angle
function updateCharacterSprite() {
  const displayDir = getDisplayDirection(character.facing);
  charSprite.setTexture(spriteMap[displayDir]);
}

// Phaser game configuration
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'phaser-container',
  backgroundColor: '#555',
  pixelArt: true,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

// Preload assets and register the isometric plugin
function preload() {
  // Load player sprites
  // Load player sprites from local files.  Remote assets are not
  // accessible in this environment, so we supply simple arrow
  // placeholders for each direction.  These PNGs were generated
  // programmatically in the repository.  See the /iso_game folder.
  this.load.image('player_right',      'player_right.png');
  this.load.image('player_right_up',   'player_right_up.png');
  this.load.image('player_left_up',    'player_left_up.png');
  this.load.image('player_left',       'player_left.png');
  this.load.image('player_left_down',  'player_left_down.png');
  this.load.image('player_right_down', 'player_right_down.png');
  this.load.image('player_up',         'player_up.png');
  this.load.image('player_down',       'player_down.png');
  // Load the hex tile image.  Stored locally in iso_game folder.
  this.load.image('hex', 'hex_tile.png');
}

// Create the scene, set up projection, build the grid and player
function create() {
  // Create a group to hold all tile images (for easy depth sorting if needed)
  isoTiles = this.add.group();

  // Build the hex grid.  For each axial coordinate, compute a 3‑D Cartesian
  // coordinate (x,y,z) then project it into screen space.  Store the
  // isoX/isoY/isoZ values on the sprite for future reference (e.g. movement
  // animations) and set a depth value based on its position so that
  // overlapping tiles draw correctly.
  for (let q = 0; q < GRID_SIZE; q++) {
    for (let r = 0; r < GRID_SIZE; r++) {
      const isoPos = axialTo3D(q, r, 0);
      const screen = projectIso(isoPos.x, isoPos.y, isoPos.z);
      const tile = this.add.image(screen.x, screen.y, 'hex');
      tile.setOrigin(0.5, 0.75);
      tile.isoX = isoPos.x;
      tile.isoY = isoPos.y;
      tile.isoZ = isoPos.z;
      // Assign depth for proper sorting
      tile.depth = computeDepth(tile.isoX, tile.isoY, tile.isoZ);
      tile.q = q;
      tile.r = r;
      tileMap.set(axialKey(q, r), tile);
      tile.setInteractive();
      tile.on('pointerup', () => {
        handleTileClick.call(this, tile.q, tile.r);
      });
      isoTiles.add(tile);
    }
  }

  // Create the player sprite.  Use the starting axial position and
  // convert it to an iso coordinate.  The sprite stores isoX/Y/Z for
  // movement tweens.  Depth is set higher than tiles so the player
  // draws on top.  The origin is set to (0.5, 1.0) so that the feet
  // align with the bottom of the tile.
  const startIso = axialTo3D(character.q, character.r, character.z);
  const startScreen = projectIso(startIso.x, startIso.y, startIso.z);
  charSprite = this.add.image(startScreen.x, startScreen.y, spriteMap[getDisplayDirection(character.facing)]);
  charSprite.setOrigin(0.5, 1.0);
  charSprite.isoX = startIso.x;
  charSprite.isoY = startIso.y;
  charSprite.isoZ = startIso.z;
  charSprite.depth = computeDepth(charSprite.isoX, charSprite.isoY, charSprite.isoZ) + 1000;
  // Register key handlers to rotate the camera angle (affects sprite facing only)
  this.input.keyboard.on('keydown-Q', () => {
    cameraAngle = (cameraAngle - ROTATION_STEP + 360) % 360;
    updateCharacterSprite.call(this);
  });
  this.input.keyboard.on('keydown-E', () => {
    cameraAngle = (cameraAngle + ROTATION_STEP) % 360;
    updateCharacterSprite.call(this);
  });
  // Initial sprite update
  updateCharacterSprite.call(this);

}

// Scene update loop (no per‑frame logic required for now)
function update() {
  // Nothing to update continuously; movement handled via tweens
}

// Start the game
const game = new Phaser.Game(config);