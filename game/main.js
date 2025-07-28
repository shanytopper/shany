/*
 * Phaser 3 implementation of the isometric hex grid RPG prototype.
 *
 * This script recreates all of the behaviour found in the original
 * DOM/CSS/Three.js versions while leveraging Phaser 3 for rendering
 * and animation.  A 5×5 pointy‑top hex grid is constructed using
 * polygons, a player sprite is positioned on the tiles and breadth‑first
 * search is used to compute shortest paths.  The entire grid rotates
 * around its centre in 30° increments when the Q or E keys are
 * pressed and the character remains upright by counter‑rotating its
 * sprite.  Directional sprites are loaded directly from the GitHub
 * repository to preserve the original graphics.
 */

const GRID_SIZE = 5;
const HEX_RADIUS = 50;
const MOVE_DURATION = 200; // milliseconds per tile during movement
const ROTATION_STEP = 30;  // degrees of rotation per key press

// Direction vectors for a pointy‑top axial hex grid.  These values
// mirror those used in the original prototype.  Each entry records
// the axial coordinate delta when moving in that direction.
const directionVectors = {
  left:       { dq: -1, dr:  0 }, // west
  'left-up':  { dq:  0, dr: -1 }, // north‑west
  'right-up': { dq:  1, dr: -1 }, // north‑east
  right:      { dq:  1, dr:  0 }, // east
  'right-down': { dq:  0, dr:  1 }, // south‑east
  'left-down':  { dq: -1, dr:  1 }  // south‑west
};

// Mapping from display orientation names to Phaser texture keys.  The
// keys correspond to images hosted in the original repository.  Note
// that 'up' and 'down' orientations are included for near‑vertical
// camera perspectives.
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

// Global camera angle (in degrees).  This value is updated when the
// player presses Q or E and determines how the grid and character are
// rotated on screen.  The angle is always normalised to the range
// [0,360).  Set the initial camera angle to 30° to match the
// isometric perspective of the original prototype.  Without this
// initial rotation the grid appears top‑down.
let cameraAngle = 30;

// References to the primary game objects.  These are assigned once
// during scene creation and then mutated as the game runs.
let gridContainer;
let charSprite;

// Player state.  The character is identified by its axial coordinates
// and the direction it is facing in world space.  Facing values are
// keys into directionVectors.
const character = { q: 2, r: 2, facing: 'right' };

// Tile position cache.  Each entry contains unrotated axial pixel
// coordinates along with the tile’s axial indices.  The values of x
// and y are computed via axialToPixel().  During scene creation the
// coordinates are adjusted by offsetX/offsetY and then assigned to
// polygon objects as their positions relative to the grid container.
let tilePositions = [];

// Convert axial (q,r) coordinates into pixel space for a pointy‑top
// hex grid.  The HEX_RADIUS constant controls the size of each tile
// and matches the original prototype’s size.  The formulas here are
// identical to those used in script.js.
function axialToPixel(q, r) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * 1.5 * r;
  return { x, y };
}

// Convert pixel (x,y) coordinates back into axial (q,r) coordinates for
// a pointy‑top hex grid.  The inverse of axialToPixel() requires
// rounding to the nearest integer axial coordinate.  The formulas
// derive from standard axial coordinate conversion: see
// https://www.redblobgames.com/grids/hex‑grids/#hex‑to‑pixel
function pixelToAxial(x, y) {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_RADIUS;
  const r = (2 / 3 * y) / HEX_RADIUS;
  return axialRound(q, r);
}

// Round fractional axial coordinates to the nearest integer hex.  This
// uses cube coordinate rounding to ensure the sum q + r + s = 0
// constraint is preserved.  See
// https://www.redblobgames.com/grids/hex‑grids/#rounding for details.
function axialRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

// Rotate an (x,y) vector by the given angle in degrees.  Positive
// angles rotate counter‑clockwise.  Used by getDisplayDirection() to
// classify world directions relative to the camera.
function rotatePoint(x, y, angleDeg) {
  const rad = Phaser.Math.DegToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

// Determine which sprite orientation should be displayed based on the
// character’s world facing direction and the current camera angle.
// This logic mirrors the quantisation used in the original prototype.
function getDisplayDirection(facing) {
  const vec = directionVectors[facing];
  // Convert the axial direction to a pixel vector (unrotated)
  const base = axialToPixel(vec.dq, vec.dr);
  // Rotate by the camera angle to see how it appears on screen
  const rot = rotatePoint(base.x, base.y, cameraAngle);
  const angle = Math.atan2(rot.y, rot.x);
  // Quantise to the nearest 30° sector and normalise to [-6,6]
  let index = Math.round(angle / (Math.PI / 6));
  if (index > 6) index -= 12;
  if (index < -6) index += 12;
  switch (index) {
    case 0:
      return 'right';
    case 1:
    case 2:
      return 'right-down';
    case 3:
      return 'down';
    case 4:
    case 5:
      return 'left-down';
    case 6:
    case -6:
      return 'left';
    case -5:
    case -4:
      return 'right-up';
    case -3:
      return 'up';
    case -2:
    case -1:
      return 'left-up';
    default:
      return 'right';
  }
}

// Generate a unique string key for an axial coordinate.  This helper
// simplifies tracking visited nodes during pathfinding.
function axialKey(q, r) {
  return `${q},${r}`;
}

// Breadth‑first search implementation for hex grids.  Given a start
// and goal coordinate it returns the shortest sequence of axial
// coordinates (excluding the start) to reach the goal.  All tiles
// are traversable so BFS guarantees an optimal path in terms of
// number of steps.
function findPath(start, goal) {
  if (start.q === goal.q && start.r === goal.r) {
    return [];
  }
  const queue = [];
  const visited = new Set();
  const cameFrom = new Map();
  const startKey = axialKey(start.q, start.r);
  queue.push(start);
  visited.add(startKey);
  cameFrom.set(startKey, null);
  let found = false;
  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = axialKey(current.q, current.r);
    if (current.q === goal.q && current.r === goal.r) {
      found = true;
      break;
    }
    for (const dirName in directionVectors) {
      const dir = directionVectors[dirName];
      const nq = current.q + dir.dq;
      const nr = current.r + dir.dr;
      // Skip out‑of‑bounds coordinates
      if (nq < 0 || nq >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) {
        continue;
      }
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

// Build a set of points representing a unit‑radius hexagon centred on
// the origin.  The points are scaled by HEX_RADIUS when creating
// polygons.  Starting the first vertex at −30° ensures the hex is
// pointy‑top and aligns with the CSS polygon used in the original.
function createHexPoints() {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    points.push(HEX_RADIUS * Math.cos(angle), HEX_RADIUS * Math.sin(angle));
  }
  return points;
}

// Phaser game configuration.  The canvas dimensions match the
// prototype and the scene hooks (preload and create) are defined
// inline below.
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'phaser-container',
  backgroundColor: '#555',
  scene: {
    preload: preload,
    create: create
  }
};

// Load sprite assets.  Images are fetched from the GitHub raw
// repository to preserve the original graphics.  If the remote
// endpoints become unavailable the game will still boot but the
// character sprites will not appear.
function preload() {
  this.load.image('player_right',      'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_right.png');
  this.load.image('player_right_up',   'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_right_up.png');
  this.load.image('player_left_up',    'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_left_up.png');
  this.load.image('player_left',       'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_left.png');
  this.load.image('player_left_down',  'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_left_down.png');
  this.load.image('player_right_down', 'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_right_down.png');
  this.load.image('player_up',         'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_up.png');
  this.load.image('player_down',       'https://raw.githubusercontent.com/shanytopper/shany/5ebc17a384859a83fc7359d7637ff63dad85d2f5/game/player_down.png');
}

// Scene creation.  Constructs the grid, positions the character,
// registers input handlers and rotates the camera on demand.  All
// variables captured from outer scope are used to maintain state.
function create() {
  // Compute unrotated tile positions and bounding box
  tilePositions = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let q = 0; q < GRID_SIZE; q++) {
    for (let r = 0; r < GRID_SIZE; r++) {
      const pos = axialToPixel(q, r);
      tilePositions.push({ q, r, x: pos.x, y: pos.y });
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
  }
  const offsetX = -minX - (maxX - minX) / 2;
  const offsetY = -minY - (maxY - minY) / 2;
  // Persist offsets on the scene for use during animation
  this.offsetX = offsetX;
  this.offsetY = offsetY;
  // Create a container centred on the canvas.  All tiles and the
  // character sprite are added as children so that rotating the
  // container rotates the entire scene around its centre.
  gridContainer = this.add.container(this.scale.width / 2, this.scale.height / 2);
  const hexPoints = createHexPoints();
  // Do not scale the grid container.  Keeping a uniform scale ensures
  // each hex remains a perfect regular hexagon.  Previously we
  // attempted to compress the vertical axis to simulate an isometric
  // perspective, but that distorted the hex shape so that it
  // no longer looked the same when rotated by 60°.  By leaving the
  // scale at (1, 1) the hexes rotate uniformly and remain identical.
  // Add tiles to the container
  tilePositions.forEach(tile => {
    const poly = this.add.polygon(tile.x + offsetX, tile.y + offsetY, hexPoints, 0xffffff);
    poly.setStrokeStyle(1, 0x000000);
    // Make the tile respond to pointer input.  Using the default
    // rectangle hit area rather than a rotated polygon simplifies
    // interaction, especially once the container is scaled and rotated.
    poly.setInteractive({ useHandCursor: true });
    // Store axial indices on the polygon for easy lookup
    poly.q = tile.q;
    poly.r = tile.r;
    // We no longer attach a per‑tile pointer handler because
    // clicks are processed globally in a single pointerdown callback.
    gridContainer.add(poly);
    tile.gameObject = poly;
  });
  // Create the character sprite and place it on its starting tile
  const startTile = tilePositions.find(t => t.q === character.q && t.r === character.r);
  charSprite = this.add.sprite(startTile.x + offsetX, startTile.y + offsetY, spriteMap[getDisplayDirection(character.facing)]);
  charSprite.setOrigin(0.5, 0.5);
  charSprite.depth = 10;
  gridContainer.add(charSprite);
  // Ensure the character remains upright by counter‑rotating it when
  // the grid turns
  charSprite.rotation = 0;
  // Register key handlers for rotating the camera.  The callback
  // functions use .call(this) to preserve the scene context.
  this.input.keyboard.on('keydown-Q', () => {
    cameraAngle = (cameraAngle - ROTATION_STEP + 360) % 360;
    updateRotation.call(this);
  });
  this.input.keyboard.on('keydown-E', () => {
    cameraAngle = (cameraAngle + ROTATION_STEP) % 360;
    updateRotation.call(this);
  });
  // Apply the initial rotation (cameraAngle defaults to 30°) to
  // position the grid in its isometric perspective.
  updateRotation.call(this);

  // Global pointer handler.  When the player clicks anywhere in the
  // scene, convert the pointer’s world coordinates into axial
  // coordinates relative to the grid container.  This bypasses
  // potential issues with interactive areas not accounting for
  // rotation or scaling.  Only clicks falling within the bounds of
  // the 5×5 grid trigger movement.
  this.input.on('pointerdown', (pointer) => {
    // Determine coordinates relative to the container’s origin
    let localX = pointer.worldX - gridContainer.x;
    let localY = pointer.worldY - gridContainer.y;
    // Undo the container’s rotation to convert to unrotated space
    const rad = Phaser.Math.DegToRad(cameraAngle);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const xUnrot = localX * cos + localY * sin;
    const yUnrot = -localX * sin + localY * cos;
    // Remove any scaling.  The grid container is no longer scaled,
    // so scaleX and scaleY are both 1.  We retain these variables
    // for clarity should scaling be reintroduced in the future.
    const scaleX = gridContainer.scaleX;
    const scaleY = gridContainer.scaleY;
    const xScaled = xUnrot / scaleX;
    const yScaled = yUnrot / scaleY;
    // Remove the offset applied when placing tiles
    const px = xScaled - this.offsetX;
    const py = yScaled - this.offsetY;
    const axial = pixelToAxial(px, py);
    const q = axial.q;
    const r = axial.r;
    // Check bounds and trigger movement
    if (q >= 0 && q < GRID_SIZE && r >= 0 && r < GRID_SIZE) {
      handleTileClick.call(this, q, r);
    }
  });
}

// Apply the current cameraAngle to the grid container and counter‑rotate
// the character sprite.  Also update the character’s displayed
// orientation to match the new viewing angle.
function updateRotation() {
  gridContainer.rotation = Phaser.Math.DegToRad(cameraAngle);
  // Counter‑rotate the sprite so it remains upright
  charSprite.rotation = -gridContainer.rotation;
  updateCharacterSprite.call(this);
}

// Update the character’s sprite texture according to its world facing
// direction and the current camera angle.  This function should be
// called whenever either of those values changes.
function updateCharacterSprite() {
  const displayDir = getDisplayDirection(character.facing);
  charSprite.setTexture(spriteMap[displayDir]);
}

// Triggered when a tile is clicked.  Computes a path using BFS and
// animates the character along that path.  Clicking the current tile
// has no effect.  The handler is bound to the scene context so that
// tweens can be created on the correct scene instance.
function handleTileClick(targetQ, targetR) {
  const path = findPath({ q: character.q, r: character.r }, { q: targetQ, r: targetR });
  if (path.length === 0) return;
  animateMovement.call(this, path);
}

// Animate the character along a sequence of axial coordinates.  A
// Phaser timeline is used to enqueue a series of tweens.  On each
// step the character’s axial coordinates and facing are updated and
// the displayed sprite is refreshed.  Movement is linear and occurs
// over MOVE_DURATION milliseconds per tile.
function animateMovement(path) {
  // Recursively animate the character along the provided sequence of axial
  // coordinates.  Instead of using the Tween Timeline API (which can be
  // unavailable on some Phaser builds), we chain individual tweens.  At
  // the end of each tween the function calls itself with the remaining
  // path.  The onStart callback updates the character’s axial position
  // and facing so that the displayed sprite changes at the correct time.
  if (!path || path.length === 0) {
    return;
  }
  // Clone the path to avoid mutating the original array
  const [step, ...rest] = path;
  const { q, r } = step;
  const tile = tilePositions.find(t => t.q === q && t.r === r);
  const targetX = tile.x + this.offsetX;
  const targetY = tile.y + this.offsetY;
  const prevQ = character.q;
  const prevR = character.r;
  this.tweens.add({
    targets: charSprite,
    x: targetX,
    y: targetY,
    duration: MOVE_DURATION,
    ease: 'Linear',
    onStart: () => {
      // Determine movement delta
      const dq = q - prevQ;
      const dr = r - prevR;
      // Update the character’s axial position
      character.q = q;
      character.r = r;
      // Update world facing based on movement delta
      if (dq === -1 && dr === 0) {
        character.facing = 'left';
      } else if (dq === 0 && dr === -1) {
        character.facing = 'left-up';
      } else if (dq === 1 && dr === -1) {
        character.facing = 'right-up';
      } else if (dq === 1 && dr === 0) {
        character.facing = 'right';
      } else if (dq === 0 && dr === 1) {
        character.facing = 'right-down';
      } else if (dq === -1 && dr === 1) {
        character.facing = 'left-down';
      }
      // Update the displayed sprite
      updateCharacterSprite.call(this);
    },
    onComplete: () => {
      animateMovement.call(this, rest);
    }
  });
}

// Instantiate the Phaser game.  The configuration above supplies all
// necessary parameters.  This call immediately triggers the preload
// and create functions on the defined scene.
const game = new Phaser.Game(config);
