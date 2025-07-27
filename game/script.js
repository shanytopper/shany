// Revised character and direction logic for the isometric hex game prototype.
//
// This version improves the way the facing direction is communicated to the
// player.  Instead of rotating a small triangle on top of the character,
// the script now highlights the neighbouring hex that the character is
// looking towards and repositions the arrow to sit on that tile.  This
// approach mirrors the presentation found in tactical RPGs like X‑Com or
// Fire Emblem, where the tile in front of the unit is emphasized to show
// facing.  The underlying math for hex rotations is based on the
// 60° increments inherent to pointy‑top hexes【472061795893607†L83-L104】.

const GRID_SIZE = 5;
const SIZE = 50; // hex radius
const game = document.getElementById('game');
let tiles = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

// Direction vectors for pointy‑top axial coordinates.  Each entry
// corresponds to one of the six neighbours.
const directionVectors = {
  up:        { dq: 0,  dr: -1 },
  'up-right': { dq: 1,  dr: -1 },
  right:     { dq: 1,  dr: 0 },
  down:      { dq: 0,  dr: 1 },
  'down-left': { dq: -1, dr: 1 },
  left:      { dq: -1, dr: 0 }
};

// Rotation angles (clockwise, degrees) for orienting the arrow icon.
// On pointy‑top grids the major axes lie at 0°, 60°, …, 300°【472061795893607†L101-L104】.
const rotationAngles = {
  up: 0,
  'up-right': 60,
  right: 120,
  down: 180,
  'down-left': 240,
  left: 300
};

// Create the direction indicator element once.  It will be repositioned
// onto the tile in front of the character and rotated accordingly.  The
// styling for this element is defined in the accompanying CSS.  Initially
// hidden until a valid facing exists.
const directionIndicator = document.createElement('div');
directionIndicator.className = 'direction-indicator';
directionIndicator.style.display = 'none';
game.appendChild(directionIndicator);

function axialToPixel(q, r) {
  const x = SIZE * Math.sqrt(3) * (q + r / 2);
  const y = SIZE * 1.5 * r;
  return { x, y };
}

function iso(x, y) {
  return { x, y };
}

// Precompute tile positions and bounding box extents.
for (let q = 0; q < GRID_SIZE; q++) {
  for (let r = 0; r < GRID_SIZE; r++) {
    const { x, y } = axialToPixel(q, r);
    const p = iso(x, y);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    tiles.push({ q, r, x: p.x, y: p.y });
  }
}

const offsetX = (game.offsetWidth - (maxX - minX)) / 2 - minX;
const offsetY = (game.offsetHeight - (maxY - minY)) / 2 - minY;

function createTiles() {
  tiles.forEach(t => {
    const div = document.createElement('div');
    div.className = 'tile';
    div.style.left = (t.x + offsetX) + 'px';
    div.style.top  = (t.y + offsetY) + 'px';
    game.appendChild(div);
    t.element = div;
  });
}

// Character state: axial coordinates, facing (for horizontal flipping of
// sprite), and viewing direction label for adjacency.  The character
// starts centred facing right.
let character = { q: 2, r: 2, facing: 'right', dir: 'right' };
const charDiv = document.createElement('div');
charDiv.className = 'character';
charDiv.style.left = '0px';
charDiv.style.top  = '0px';
charDiv.style.backgroundImage = "url('player_side.png')";
game.appendChild(charDiv);

// Keep track of which tile is currently highlighted.  This allows us to
// remove the highlight when the character changes direction.
let highlightedTile = null;

/**
 * Highlight the tile that the character is facing.  This function first
 * removes the highlight from the previously targeted tile (if any), then
 * computes the neighbouring axial coordinate based on the current
 * direction.  If the neighbour lies within bounds, the corresponding
 * tile element is given the `.facing` class which tints the tile via
 * CSS.  Otherwise the indicator remains hidden.
 */
function highlightFacingTile() {
  // Remove previous highlight
  if (highlightedTile) {
    highlightedTile.element.classList.remove('facing');
    highlightedTile = null;
  }
  const vec = directionVectors[character.dir];
  if (!vec) {
    return;
  }
  const targetQ = character.q + vec.dq;
  const targetR = character.r + vec.dr;
  if (targetQ < 0 || targetQ >= GRID_SIZE || targetR < 0 || targetR >= GRID_SIZE) {
    return;
  }
  const tile = tiles.find(t => t.q === targetQ && t.r === targetR);
  if (tile) {
    tile.element.classList.add('facing');
    highlightedTile = tile;
  }
}

/**
 * Reposition and rotate the arrow indicator to sit on the tile that the
 * character is viewing.  If the neighbouring tile is out of bounds the
 * arrow is hidden.  The indicator uses the same rotation angles as the
 * original implementation but is now centred on the target tile.
 */
function updateDirectionIndicator() {
  const vec = directionVectors[character.dir];
  if (!vec) {
    directionIndicator.style.display = 'none';
    return;
  }
  const q = character.q + vec.dq;
  const r = character.r + vec.dr;
  if (q < 0 || q >= GRID_SIZE || r < 0 || r >= GRID_SIZE) {
    directionIndicator.style.display = 'none';
    return;
  }
  const { x, y } = axialToPixel(q, r);
  const p = iso(x, y);
  directionIndicator.style.left = (p.x + offsetX) + 'px';
  directionIndicator.style.top  = (p.y + offsetY) + 'px';
  // Centre the arrow on the tile
  const arrowW = 20;
  const arrowH = 20;
  const tx = -arrowW / 2;
  const ty = -arrowH / 2;
  const angle = rotationAngles[character.dir] ?? 0;
  directionIndicator.style.transform = `translate(${tx}px, ${ty}px) rotate(${angle}deg)`;
  directionIndicator.style.display = 'block';
}

/**
 * Update the character's sprite position and orientation.  After moving
 * the sprite the function updates the highlighted tile and the
 * direction indicator.  Horizontal flips are still applied for left
 * versus right facing but the indicator now communicates direction via
 * tile highlighting.
 */
function updateCharacter() {
  const { x, y } = axialToPixel(character.q, character.r);
  const p = iso(x, y);
  charDiv.style.left = (p.x + offsetX) + 'px';
  charDiv.style.top  = (p.y + offsetY) + 'px';
  charDiv.style.backgroundImage = "url('player_side.png')";
  const scaleX = character.facing === 'left' ? -1 : 1;
  charDiv.style.transform = `translate(-15px, -19px) scaleX(${scaleX})`;
  // Highlight the adjacent tile and reposition the arrow
  highlightFacingTile();
  updateDirectionIndicator();
}

/**
 * Move the character by the given axial delta.  If the destination is
 * within bounds the character's position is updated and the facing
 * direction (for sprite flipping) and viewing direction are derived from
 * the movement vector.
 */
function moveCharacter(dq, dr) {
  const newQ = character.q + dq;
  const newR = character.r + dr;
  if (newQ >= 0 && newQ < GRID_SIZE && newR >= 0 && newR < GRID_SIZE) {
    character.q = newQ;
    character.r = newR;
    // Determine horizontal facing for sprite flip
    if (dq < 0) {
      character.facing = 'left';
    } else if (dq > 0) {
      character.facing = 'right';
    }
    // Assign direction label based on movement
    if (dq === 0 && dr === -1) {
      character.dir = 'up';
    } else if (dq === 1 && dr === -1) {
      character.dir = 'up-right';
    } else if (dq === 1 && dr === 0) {
      character.dir = 'right';
    } else if (dq === 0 && dr === 1) {
      character.dir = 'down';
    } else if (dq === -1 && dr === 1) {
      character.dir = 'down-left';
    } else if (dq === -1 && dr === 0) {
      character.dir = 'left';
    }
    updateCharacter();
  }
}

// Keyboard controls for movement in each of the six axial directions
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp':    moveCharacter(0, -1); break;
    case 'ArrowDown':  moveCharacter(0, 1);  break;
    case 'ArrowLeft':  moveCharacter(-1, 0); break;
    case 'ArrowRight': moveCharacter(1, 0);  break;
    case 'q':
    case 'Q':
      moveCharacter(-1, 1);
      break;
    case 'e':
    case 'E':
      moveCharacter(1, -1);
      break;
  }
});

// Initialise the grid and character
createTiles();
updateCharacter();