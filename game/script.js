// Revised indicator for multiple-character hex tactical game.
//
// This variant discards tile highlighting and instead anchors a
// directional arrow on the same hex as the character.  The arrow
// protrudes from the character’s tile in the direction they are
// looking, similar to the direction wedges seen in tactical RPGs
// like Fire Emblem or X‑Com.  The offset from the character is
// computed using polar coordinates so that the arrow sits near the
// edge of the current hex.  Rotation still occurs in 60° increments
// appropriate for pointy‑top hexes【472061795893607†L83-L104】.

const GRID_SIZE = 5;
const SIZE = 50;
const game = document.getElementById('game');
let tiles = [];

// Direction vectors for axial coordinates
const directionVectors = {
  up:         { dq: 0,  dr: -1 },
  'up-right': { dq: 1,  dr: -1 },
  right:      { dq: 1,  dr: 0 },
  down:       { dq: 0,  dr: 1 },
  'down-left':{ dq: -1, dr: 1 },
  left:       { dq: -1, dr: 0 }
};

// Rotation angles for arrow icon (degrees clockwise)
const rotationAngles = {
  up: 0,
  'up-right': 60,
  right: 120,
  down: 180,
  'down-left': 240,
  left: 300
};

// Direction indicator element appended once.
const directionIndicator = document.createElement('div');
directionIndicator.className = 'direction-indicator';
game.appendChild(directionIndicator);

function axialToPixel(q, r) {
  const x = SIZE * Math.sqrt(3) * (q + r / 2);
  const y = SIZE * 1.5 * r;
  return { x, y };
}
function iso(x, y) {
  return { x, y };
}

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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

let character = { q: 2, r: 2, facing: 'right', dir: 'right' };
const charDiv = document.createElement('div');
charDiv.className = 'character';
charDiv.style.backgroundImage = "url('player_side.png')";
game.appendChild(charDiv);

// Position and orient the character sprite and the directional arrow.
function updateCharacter() {
  const { x, y } = axialToPixel(character.q, character.r);
  const p = iso(x, y);
  charDiv.style.left = (p.x + offsetX) + 'px';
  charDiv.style.top  = (p.y + offsetY) + 'px';
  const scaleX = character.facing === 'left' ? -1 : 1;
  charDiv.style.transform = `translate(-15px, -19px) scaleX(${scaleX})`;

  // Compute arrow offset so it sits near the edge of the tile.  The
  // offset radius is proportional to the tile size.  Angles are
  // measured clockwise with 0° pointing “up” (towards the negative y
  // axis).  Subtracting 90° converts 0° so that it corresponds to
  // angle -90° in the standard unit circle.
  const angleDeg = rotationAngles[character.dir] ?? 0;
  const rad = (angleDeg - 90) * Math.PI / 180;
  const arrowW = 20;
  const arrowH = 20;
  const dist = 35; // distance from character centre to arrow centre
  const tx = dist * Math.cos(rad) - arrowW / 2;
  const ty = dist * Math.sin(rad) - arrowH / 2;
  directionIndicator.style.left = charDiv.style.left;
  directionIndicator.style.top  = charDiv.style.top;
  directionIndicator.style.transform = `translate(${tx}px, ${ty}px) rotate(${angleDeg}deg)`;
}

function moveCharacter(dq, dr) {
  const newQ = character.q + dq;
  const newR = character.r + dr;
  if (newQ >= 0 && newQ < GRID_SIZE && newR >= 0 && newR < GRID_SIZE) {
    character.q = newQ;
    character.r = newR;
    if (dq < 0) {
      character.facing = 'left';
    } else if (dq > 0) {
      character.facing = 'right';
    }
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

createTiles();
updateCharacter();