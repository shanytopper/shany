// Revised character and direction logic for the isometric hex game prototype.
//
// This version improves the way the facing direction is communicated to the
// player.  Instead of rotating a small triangle on top of the character,
// the script now highlights the neighbouring hex that the character is
// looking towards and repositions the arrow to sit on that tile.  This
// approach mirrors the presentation found in tactical RPGs like X‑Com or
// Fire Emblem, where the tile in front of the unit is emphasized to show
// facing.  The underlying math for hex rotations is based on the
// 60° increments inherent to pointy‑top hexes.
//
// The major change in this version compared to the original keyboard‑driven
// prototype is the introduction of mouse‑based movement.  Instead of
// pressing keys to move the character by one tile at a time, the player
// clicks on a destination hex.  A simple breadth‑first search (BFS)
// pathfinding algorithm is used to determine a valid path across the
// grid.  The character then animates along this path, updating its facing
// direction after each step so that the direction indicator and sprite
// flip reflect the most recent move.

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
// On pointy‑top grids the major axes lie at 0°, 60°, …, 300°.
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

/**
 * Convert an axial coordinate into a unique string key.  This helper is
 * used by the pathfinding routines to track visited nodes and to map
 * predecessors for path reconstruction.
 * @param {number} q Axial q coordinate
 * @param {number} r Axial r coordinate
 * @returns {string} A unique key for the coordinate
 */
function axialKey(q, r) {
  return `${q},${r}`;
}

/**
 * Compute a path between two axial coordinates on the hex grid using
 * breadth‑first search.  All moves have equal cost so BFS yields the
 * shortest path in terms of number of steps.  If no path exists (which
 * cannot happen in this simple prototype because all tiles are traversable)
 * an empty array is returned.
 *
 * The returned path excludes the starting position; it begins with the
 * first neighbour to visit and ends with the goal coordinate.
 *
 * @param {{q:number, r:number}} start Starting axial coordinate
 * @param {{q:number, r:number}} goal Destination axial coordinate
 * @returns {Array<{q:number,r:number}>} Array of axial positions to walk through
 */
function findPath(start, goal) {
  // If the start and goal are the same, return an empty path.
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
    // Explore all neighbouring tiles using the six direction vectors
    for (const dir of Object.keys(directionVectors)) {
      const vec = directionVectors[dir];
      const nq = current.q + vec.dq;
      const nr = current.r + vec.dr;
      // Skip out‑of‑bounds coordinates
      if (nq < 0 || nq >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) {
        continue;
      }
      const neighbourKey = axialKey(nq, nr);
      if (visited.has(neighbourKey)) {
        continue;
      }
      visited.add(neighbourKey);
      queue.push({ q: nq, r: nr });
      // Record where we came from to reconstruct the path later
      cameFrom.set(neighbourKey, { q: current.q, r: current.r });
    }
  }
  // If the goal wasn't reached, return an empty path
  if (!found) {
    return [];
  }
  // Reconstruct the path by walking backwards from the goal to the start
  const path = [];
  let currentKey = axialKey(goal.q, goal.r);
  let current = { q: goal.q, r: goal.r };
  while (currentKey !== startKey) {
    path.unshift(current);
    const prev = cameFrom.get(currentKey);
    // Safety check: if prev is undefined (which shouldn't happen), abort
    if (!prev) {
      break;
    }
    current = { q: prev.q, r: prev.r };
    currentKey = axialKey(current.q, current.r);
  }
  return path;
}

/**
 * Animate the character along a given path.  Each step is delayed by a
 * small amount to allow the player to follow the movement visually.  As
 * the character moves, the facing direction and sprite flip are updated
 * according to the direction of motion.
 *
 * @param {Array<{q:number,r:number}>} path Sequence of axial coordinates
 * @returns {Promise<void>} Resolves when the animation has completed
 */
async function animateMovement(path) {
  for (const nextStep of path) {
    // Compute the delta between the character's current position and the
    // next step.  This delta is used to determine facing direction and
    // to update the axial coordinates.
    const dq = nextStep.q - character.q;
    const dr = nextStep.r - character.r;
    // Move the character one step in the appropriate direction
    moveCharacter(dq, dr);
    // Wait a short duration before proceeding to the next step
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/**
 * Handle a click on a tile.  This function triggers the BFS pathfinder to
 * compute a route from the character's current location to the clicked
 * destination.  The character is then animated along this route.  If
 * the destination is the current tile or no path exists, nothing happens.
 *
 * @param {number} targetQ Axial q coordinate of the clicked tile
 * @param {number} targetR Axial r coordinate of the clicked tile
 */
function handleTileClick(targetQ, targetR) {
  const path = findPath({ q: character.q, r: character.r }, { q: targetQ, r: targetR });
  if (path.length === 0) {
    return;
  }
  animateMovement(path);
}

function createTiles() {
  tiles.forEach(t => {
    const div = document.createElement('div');
    div.className = 'tile';
    div.style.left = (t.x + offsetX) + 'px';
    div.style.top  = (t.y + offsetY) + 'px';
    game.appendChild(div);
    t.element = div;
    // Attach a click handler to each tile.  When the tile is clicked the
    // character will attempt to move to that location via BFS pathfinding.
    div.addEventListener('click', () => handleTileClick(t.q, t.r));
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

// Initialise the grid and character
createTiles();
updateCharacter();
