// Grid and character logic for the isometric hex game prototype.
// This script positions a hexagonal grid and moves a character across it
// using keyboard controls. The character is represented by a div which we
// style via CSS. See style.css for the sprite setup.

const GRID_SIZE = 5;
const SIZE = 50; // hex radius
const game = document.getElementById('game');
let tiles = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

function axialToPixel(q, r) {
  const x = SIZE * Math.sqrt(3) * (q + r / 2);
  const y = SIZE * 1.5 * r;
  return { x, y };
}

function iso(x, y) {
  // The container is already transformed with rotateX to get an
  // isometric view, so no additional coordinate conversion is
  // required here.
  return { x, y };
}

// Precompute positions of all tiles and record min/max extents so that
// we can centre the board in the viewport.
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
    div.style.top = (t.y + offsetY) + 'px';
    game.appendChild(div);
    t.element = div;
  });
}

// Character state and element
// Track the axial coordinates and the current facing direction of the character.
// The character starts at the centre of the grid facing right by default.  We
// only store 'left' or 'right' as the facing since we use a single sprite
// that gets flipped horizontally via CSS transforms.
let character = { q: 2, r: 2, facing: 'right' };
const charDiv = document.createElement('div');
charDiv.className = 'character';

// Initial positioning; the script will update left/top on first render.
charDiv.style.left = '0px';
charDiv.style.top = '0px';

// Use the single side sprite for both directions.
charDiv.style.backgroundImage = "url('player_side.png')";

// Append character to game container.
game.appendChild(charDiv);

// Update the character's position and orientation.  We translate the sprite
// by half its width and height (15px and 19px respectively) to centre it on
// the hex tile.  We then apply scaleX(1) or scaleX(-1) based on the facing.
function updateCharacter() {
  const { x, y } = axialToPixel(character.q, character.r);
  const p = iso(x, y);
  charDiv.style.left = (p.x + offsetX) + 'px';
  charDiv.style.top = (p.y + offsetY) + 'px';
  // Always use the same sprite image; flipping happens via transform.
  charDiv.style.backgroundImage = "url('player_side.png')";
  // Compose translation and horizontal flip.  Negative scale on X flips the
  // sprite without altering its origin; translation centres the sprite.
  const scaleX = character.facing === 'left' ? -1 : 1;
  charDiv.style.transform = `translate(-15px, -19px) scaleX(${scaleX})`;
}

function moveCharacter(dq, dr) {
  const newQ = character.q + dq;
  const newR = character.r + dr;
  if (newQ >= 0 && newQ < GRID_SIZE && newR >= 0 && newR < GRID_SIZE) {
    character.q = newQ;
    character.r = newR;
    // Update facing direction based on horizontal movement.  For diagonal moves
    // we consider the q component: negative q means facing left, positive q means right.
    if (dq < 0) {
      character.facing = 'left';
    } else if (dq > 0) {
      character.facing = 'right';
    }
    updateCharacter();
  }
}

// Keyboard controls for the six possible movement directions on a pointy-top hex grid.
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp':
      moveCharacter(0, -1);
      break;
    case 'ArrowDown':
      moveCharacter(0, 1);
      break;
    case 'ArrowLeft':
      moveCharacter(-1, 0);
      break;
    case 'ArrowRight':
      moveCharacter(1, 0);
      break;
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

// Initialise the board and character position.
createTiles();
updateCharacter();