/*
 * main.js – WebGL re‑implementation of the hex based isometric RPG prototype.
 *
 * This script uses Three.js to render a flat grid of hexagonal tiles and a
 * simple player avatar represented by an arrow helper.  It reproduces
 * movement, rotation and pathfinding logic from the original DOM/CSS
 * implementation but leverages GPU accelerated WebGL for smooth
 * animations and richer visual effects.  The camera remains fixed
 * relative to the world; the grid group is rotated in 30° increments when
 * pressing Q or E.  Clicking a tile computes a shortest path via
 * breadth‑first search and animates the avatar along that path.
 */

(() => {
  'use strict';

  // Configuration constants.  These mirror the original prototype’s
  // parameters where appropriate.
  const GRID_SIZE    = 5;     // number of tiles in each dimension
  const HEX_RADIUS   = 1.0;   // radius of each hex (distance from centre to a vertex)
  const TILE_HEIGHT  = 0.2;   // extrusion height of each hex tile
  const MOVE_DURATION = 400;  // milliseconds to traverse a single tile
  const ROTATION_STEP = 30;   // degrees to rotate the camera/grid when Q/E is pressed

  // Axial direction vectors for a pointy‑top hex grid.  These are
  // identical to those used in the original JavaScript version.  The keys
  // are provided for clarity; we iterate the values when expanding
  // neighbours.
  const directions = [
    { dq: -1, dr: 0 },      // west
    { dq: 0,  dr: -1 },     // north‑west
    { dq: 1,  dr: -1 },     // north‑east
    { dq: 1,  dr: 0 },      // east
    { dq: 0,  dr: 1 },      // south‑east
    { dq: -1, dr: 1 }       // south‑west
  ];

  // Global state.  In a larger project these would be encapsulated in
  // classes or modules, but for this small prototype we keep them at
  // module scope for ease of access.
  let scene, camera, renderer;
  let gridGroup;             // holds all tiles and the avatar
  const hexMeshes = [];      // flat array of tile meshes used for raycasting
  let character;             // the avatar represented by a THREE.ArrowHelper
  let charPosition = { q: 2, r: 2 }; // current axial coordinates of the avatar
  let isAnimating = false;   // flag to prevent concurrent animations
  let cameraAngle = 0;       // current rotation angle of the grid about the Y axis
  let raycaster, mouse;

  // Entry point – sets up the scene, builds the grid and binds
  // interaction handlers.  Invoked immediately after definition.
  init();
  animate();

  /**
   * Initialise Three.js renderer, scene, camera, lighting and objects.
   */
  function init() {
    const container = document.getElementById('game');
    // Create the WebGL renderer and append its canvas to the container.
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Set up the scene and camera.  The camera sits above and behind
    // the origin, looking down towards the grid.  We deliberately keep
    // the camera static and instead rotate the grid group on keypress.
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x444444);
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, 8, 8);
    camera.lookAt(0, 0, 0);

    // Basic lighting: ambient to soften shadows and a directional light
    // casting across the grid.  The directional light emphasises the
    // extrusion of the hex tiles.
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(5, 10, 5);
    scene.add(directional);

    // Create a group to contain all grid elements.  Rotating this
    // group produces the same effect as rotating the camera around the
    // scene but avoids complex camera transformations.
    gridGroup = new THREE.Group();
    scene.add(gridGroup);

    // Build the hex grid and avatar.  The avatar is added after the
    // grid so that it sits on top of the tiles.
    createGrid();
    createCharacter();

    // Set up raycaster for mouse picking and a vector for normalised
    // device coordinates.  Pointer events feed values into the mouse
    // vector which the raycaster uses to query intersections.
    raycaster = new THREE.Raycaster();
    mouse     = new THREE.Vector2();

    // Register event listeners.  Resize events adjust the renderer
    // dimensions and camera aspect ratio.  Pointer events trigger
    // movement if a tile is clicked.  Key presses rotate the grid.
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Create and position all hex tiles within the grid group.  After
   * populating the group with meshes the centre of the grid is
   * computed and the group is translated so that rotation occurs
   * around the centre.  Each tile is stored in the hexMeshes array for
   * raycasting.
   */
  function createGrid() {
    // Precompute a geometry for the hexagonal prism.  The geometry is
    // rotated by 30° (π/6) so that a point faces "north", matching a
    // pointy‑top hex layout.  We clone this geometry for every tile to
    // avoid sharing vertex buffers that would complicate material
    // assignments.
    const baseGeom = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, TILE_HEIGHT, 6, 1);
    baseGeom.rotateY(Math.PI / 6);

    // Collect world positions to calculate the bounding box later.
    const positions = [];

    for (let q = 0; q < GRID_SIZE; q++) {
      for (let r = 0; r < GRID_SIZE; r++) {
        // Clone the base geometry so each tile can have its own material.
        const geom = baseGeom.clone();
        // Alternate colours for a subtle board effect.  These colours
        // echo the muted greens and browns of tactical RPGs.
        const isEven = (q + r) % 2 === 0;
        const colour = isEven ? 0x88aa77 : 0x779966;
        const mat = new THREE.MeshStandardMaterial({ color: colour, flatShading: true });
        const mesh = new THREE.Mesh(geom, mat);
        // Compute world position for this axial coordinate.  Only x and
        // z are used; y remains at 0 so the top of the tile sits on
        // y=0 once group translation is applied.
        const worldPos = axialToWorld(q, r);
        mesh.position.set(worldPos.x, 0, worldPos.z);
        // Record axial coordinates on the mesh for later pathfinding.
        mesh.userData = { q, r };
        // Add to group and arrays.
        gridGroup.add(mesh);
        hexMeshes.push(mesh);
        positions.push(new THREE.Vector3(worldPos.x, 0, worldPos.z));
      }
    }
    // Compute bounding box of all positions and centre the grid about
    // the origin.  Only the x and z coordinates are considered since
    // all y coordinates are zero.  The group is moved rather than each
    // child mesh, simplifying subsequent movement logic.
    const box = new THREE.Box3().setFromPoints(positions);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    gridGroup.position.set(-centre.x, 0, -centre.z);
  }

  /**
   * Create the player avatar.  A THREE.ArrowHelper is used to
   * represent direction.  Its shaft and head dimensions are scaled
   * relative to the hex radius.  The arrow is initially oriented
   * pointing east (positive x direction) which corresponds to the
   * 'right' facing used in the original prototype.
   */
  function createCharacter() {
    // Choose a direction for the arrow to point initially (east).  The
    // vector is normalised by ArrowHelper internally.
    const dir = new THREE.Vector3(1, 0, 0);
    const length = HEX_RADIUS * 0.8;
    const headLength = HEX_RADIUS * 0.4;
    const headWidth = HEX_RADIUS * 0.3;
    const color = 0xffaa00;
    character = new THREE.ArrowHelper(dir, new THREE.Vector3(), length, color, headLength, headWidth);
    // Place the avatar at its starting axial coordinate.  We compute
    // local position using axial coordinates and add the grid offset by
    // leveraging the existing mesh positions.  Because the grid group
    // has been translated to centre the grid, these local coordinates
    // remain valid.
    const pos = axialToWorld(charPosition.q, charPosition.r);
    character.position.set(pos.x, 0, pos.z);
    gridGroup.add(character);
  }

  /**
   * Convert axial coordinates (q, r) into local 3D coordinates for
   * placement within the grid group.  This uses the same formulas as
   * the original prototype but returns a THREE.Vector3 for
   * convenience.  The y coordinate is always zero; extrusion height is
   * handled via geometry translation.
   *
   * @param {number} q Axial q coordinate
   * @param {number} r Axial r coordinate
   * @returns {THREE.Vector3} A 3D position in grid space
   */
  function axialToWorld(q, r) {
    const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
    const z = HEX_RADIUS * 1.5 * r;
    return new THREE.Vector3(x, 0, z);
  }

  /**
   * Handle window resize by updating the renderer dimensions and camera
   * aspect ratio.  Ensures the scene remains correctly proportioned.
   */
  function onWindowResize() {
    const container = renderer.domElement.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /**
   * Process pointer (mouse or touch) down events.  If the user clicks
   * on a tile and no animation is currently running, compute a path
   * from the avatar’s current tile to the clicked tile and animate
   * movement along that path.  If the clicked tile is the current
   * location or no path exists (which cannot occur in this prototype
   * since all tiles are traversable) nothing happens.
   *
   * @param {PointerEvent} event Browser pointer event
   */
  function onPointerDown(event) {
    if (isAnimating) return;
    const rect = renderer.domElement.getBoundingClientRect();
    // Convert screen coordinates into normalized device coordinates (-1..1).
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hexMeshes);
    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const { q, r } = mesh.userData;
      // Avoid recomputing if clicked tile is current position.
      if (q === charPosition.q && r === charPosition.r) {
        return;
      }
      const path = findPath(charPosition.q, charPosition.r, q, r);
      if (path.length > 0) {
        animateMovement(path);
      }
    }
  }

  /**
   * Handle key presses.  Q rotates the grid counter‑clockwise (to
   * the left) by 30 degrees.  E rotates clockwise by the same amount.
   * The rotation is applied to the entire grid group so that tiles
   * and the avatar remain aligned.  Rotation wraps around 360°.
   *
   * @param {KeyboardEvent} event Browser key event
   */
  function onKeyDown(event) {
    // Ignore repeated key events to prevent overshooting rotation.
    if (event.repeat) return;
    if (event.key === 'q' || event.key === 'Q') {
      cameraAngle = (cameraAngle - ROTATION_STEP) % 360;
      if (cameraAngle < 0) cameraAngle += 360;
      updateRotation();
    } else if (event.key === 'e' || event.key === 'E') {
      cameraAngle = (cameraAngle + ROTATION_STEP) % 360;
      updateRotation();
    }
  }

  /**
   * Apply the current camera angle to the grid group.  Converting
   * degrees to radians is necessary since Three.js uses radians for
   * rotations.  Only the Y axis is rotated; X and Z remain fixed.
   */
  function updateRotation() {
    gridGroup.rotation.y = THREE.MathUtils.degToRad(cameraAngle);
  }

  /**
   * Perform a breadth‑first search on the hex grid to find the
   * shortest path between two axial coordinates.  Each move costs
   * equal weight so BFS yields the minimal number of steps.  The
   * returned array excludes the starting tile; it begins with the
   * first step and ends with the destination.  If start and goal are
   * identical an empty array is returned.
   *
   * @param {number} startQ Starting axial q coordinate
   * @param {number} startR Starting axial r coordinate
   * @param {number} goalQ  Goal axial q coordinate
   * @param {number} goalR  Goal axial r coordinate
   * @returns {Array<{q:number,r:number}>} Sequence of axial coordinates
   */
  function findPath(startQ, startR, goalQ, goalR) {
    if (startQ === goalQ && startR === goalR) {
      return [];
    }
    const queue = [];
    const visited = new Set();
    const cameFrom = new Map();
    const startKey = `${startQ},${startR}`;
    queue.push({ q: startQ, r: startR });
    visited.add(startKey);
    cameFrom.set(startKey, null);
    let found = false;
    while (queue.length > 0) {
      const current = queue.shift();
      const currentKey = `${current.q},${current.r}`;
      if (current.q === goalQ && current.r === goalR) {
        found = true;
        break;
      }
      for (const dir of directions) {
        const nq = current.q + dir.dq;
        const nr = current.r + dir.dr;
        // Skip out‑of‑bounds coordinates
        if (nq < 0 || nq >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) {
          continue;
        }
        const nKey = `${nq},${nr}`;
        if (visited.has(nKey)) {
          continue;
        }
        visited.add(nKey);
        queue.push({ q: nq, r: nr });
        cameFrom.set(nKey, { q: current.q, r: current.r });
      }
    }
    if (!found) {
      return [];
    }
    // Reconstruct path by walking backwards from the goal to the start
    const path = [];
    let currKey = `${goalQ},${goalR}`;
    let curr = { q: goalQ, r: goalR };
    while (currKey !== startKey) {
      path.unshift({ q: curr.q, r: curr.r });
      const prev = cameFrom.get(currKey);
      if (!prev) break;
      currKey = `${prev.q},${prev.r}`;
      curr = prev;
    }
    return path;
  }

  /**
   * Animate the avatar along a computed path.  Movement is performed
   * sequentially from one tile to the next.  The avatar’s direction
   * vector is updated prior to each step and the arrow is moved via
   * linear interpolation over a fixed duration.  A Promise is
   * returned for each step to enable awaiting completion before
   * progressing to the next move.  At the end of the path the global
   * state charPosition is updated and the animation flag cleared.
   *
   * @param {Array<{q:number,r:number}>} path Sequence of axial
   *        coordinates to walk through
   */
  async function animateMovement(path) {
    isAnimating = true;
    try {
      for (const step of path) {
        // Current local position and next local position in grid space.
        const startLocal = axialToWorld(charPosition.q, charPosition.r);
        const endLocal   = axialToWorld(step.q, step.r);
        // Compute direction vector in the grid’s local coordinate system.
        const dir = endLocal.clone().sub(startLocal);
        dir.y = 0;
        if (dir.lengthSq() > 0) {
          dir.normalize();
          character.setDirection(dir);
        }
        // Perform the linear interpolation over MOVE_DURATION
        await moveBetween(startLocal, endLocal, MOVE_DURATION);
        // Update stored axial position once the move is finished
        charPosition.q = step.q;
        charPosition.r = step.r;
      }
    } finally {
      isAnimating = false;
    }
  }

  /**
   * Linearly interpolate the avatar’s position between two points in
   * grid space.  Returns a Promise which resolves once the movement
   * completes.  The interpolation uses requestAnimationFrame so the
   * motion is synchronised with the render loop.
   *
   * @param {THREE.Vector3} start Starting local position
   * @param {THREE.Vector3} end   Ending local position
   * @param {number} duration     Duration of the interpolation in ms
   * @returns {Promise<void>} Resolves when interpolation completes
   */
  function moveBetween(start, end, duration) {
    return new Promise((resolve) => {
      const initial = start.clone();
      const delta   = end.clone().sub(start);
      const startTime = performance.now();
      function step() {
        const now = performance.now();
        const t = Math.min((now - startTime) / duration, 1);
        // Update the avatar’s local position.  Because the grid group
        // has been translated to centre the world, these coordinates
        // remain valid and are transformed into world space automatically.
        character.position.x = initial.x + delta.x * t;
        character.position.z = initial.z + delta.z * t;
        character.position.y = 0; // keep the arrow on the tile surface
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  /**
   * Main render loop.  Continuously draws the scene using
   * requestAnimationFrame.  Additional per‑frame logic (such as
   * updating particle systems) could be inserted here if desired.
   */
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

})();