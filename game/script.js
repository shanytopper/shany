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

let character = { q: 2, r: 2 };
const charDiv = document.createElement('div');
charDiv.className = 'character';
charDiv.style.left = '0px';
charDiv.style.top = '0px';

game.appendChild(charDiv);

function updateCharacter() {
  const { x, y } = axialToPixel(character.q, character.r);
  const p = iso(x, y);
  charDiv.style.left = (p.x + offsetX) + 'px';
  charDiv.style.top = (p.y + offsetY) + 'px';
}

function moveCharacter(dq, dr) {
  const newQ = character.q + dq;
  const newR = character.r + dr;
  if (newQ >= 0 && newQ < GRID_SIZE && newR >= 0 && newR < GRID_SIZE) {
    character.q = newQ;
    character.r = newR;
    updateCharacter();
  }
}

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

createTiles();
updateCharacter();

