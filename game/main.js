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

  // Amplitudes controlling how far the arms and legs swing during
  // movement.  Adjust these constants to change the character’s
  // walking animation.  Values are in radians.
  const ARM_SWING = Math.PI / 6; // ~30°
  const LEG_SWING = Math.PI / 8; // ~22.5°

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
  let character;             // the avatar represented by a THREE.Group (cylinder and sphere)
  let charPosition = { q: 2, r: 2 }; // current axial coordinates of the avatar
  let isAnimating = false;   // flag to prevent concurrent animations
  let cameraAngle = 0;       // current rotation angle of the grid about the Y axis
  let raycaster, mouse;

  // Limb groups for animation.  These are populated when the avatar is
  // created.  Storing references at module scope allows the animation
  // routines to access and rotate the limbs each frame of a movement.
  let leftArmGroup, rightArmGroup, leftLegGroup, rightLegGroup;

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
   * Create and position all hex tiles within the grid group.  A custom
   * extruded geometry is used for each tile to ensure the shape and
   * orientation exactly match the axial coordinate system.  After
   * populating the group the centre of the grid is computed and the
   * group is translated so that rotations occur around its centre.
   */
  function createGrid() {
    // Precompute a pointy‑top hex prism geometry.  The shape is
    // defined in the XY plane with a vertex at the top (positive Y)
    // and extruded along the positive Z axis.  It is then rotated
    // around the X axis so the extrusion lies along the Y axis.  The
    // resulting prism spans from y=0 to y=TILE_HEIGHT.
    const baseGeom = (function buildHexPrism() {
      const shape = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        // Start at 30° so that the first vertex lies at the top of
        // the hex (pointy‑top orientation).  Subsequent vertices
        // advance around the circle in 60° increments.
        const angle = Math.PI / 3 * i + Math.PI / 6;
        const x = HEX_RADIUS * Math.cos(angle);
        const y = HEX_RADIUS * Math.sin(angle);
        if (i === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      }
      shape.closePath();
      const extrudeSettings = { depth: TILE_HEIGHT, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Rotate so that extrusion extends along the Y axis.
      geom.rotateX(Math.PI / 2);
      return geom;
    })();

    // Collect centre positions to calculate the bounding box later.  We
    // ignore the y component because centring is only applied in the
    // horizontal plane.
    const positions = [];

    for (let q = 0; q < GRID_SIZE; q++) {
      for (let r = 0; r < GRID_SIZE; r++) {
        const geom = baseGeom.clone();
        const isEven = (q + r) % 2 === 0;
        const colour = isEven ? 0x88aa77 : 0x779966;
        const mat = new THREE.MeshStandardMaterial({ color: colour, flatShading: true });
        const mesh = new THREE.Mesh(geom, mat);
        // Each tile spans from y=0 to y=TILE_HEIGHT, so its base sits at
        // y=0.  No vertical translation is necessary.  Compute its
        // horizontal position from axial coordinates.
        const worldPos = axialToWorld(q, r);
        mesh.position.set(worldPos.x, 0, worldPos.z);
        mesh.userData = { q, r };
        gridGroup.add(mesh);
        hexMeshes.push(mesh);
        positions.push(new THREE.Vector3(worldPos.x, 0, worldPos.z));
      }
    }
    // Centre the grid horizontally by translating the group.  The y
    // coordinate remains zero so that tiles rest on the ground plane.
    const box = new THREE.Box3().setFromPoints(positions);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    gridGroup.position.set(-centre.x, 0, -centre.z);
  }

  /**
   * Create the player avatar.  In the original prototype the player was a
   * small soldier sprite rendered via CSS.  Because no image assets are
   * available in this project, we approximate that character using a
   * low‑poly 3D model assembled from basic primitives.  The avatar
   * consists of a cylindrical torso, two legs, two arms, a head and a
   * helmet.  All sub‑meshes are grouped together so that rotations and
   * translations apply uniformly.  Colours are chosen to evoke a simple
   * uniform: dark clothing, a grey helmet and a lighter skin tone.
   */
  function createCharacter() {
    const group = new THREE.Group();
    // Dimensions relative to the hex radius.  Adjust these constants to
    // change the proportions of the avatar.
    const bodyRadius = HEX_RADIUS * 0.3;
    const bodyHeight = HEX_RADIUS * 0.8;
    const legRadius  = bodyRadius * 0.35;
    const legHeight  = bodyHeight * 0.5;
    const armRadius  = bodyRadius * 0.25;
    const armLength  = bodyHeight * 0.75;
    const headRadius = HEX_RADIUS * 0.25;
    const helmetRadius = headRadius * 1.1;

    // Torso
    const torsoGeom = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 16);
    // Anchor the torso so its base sits at y=0.
    torsoGeom.translate(0, bodyHeight / 2, 0);
    const torsoMat  = new THREE.MeshStandardMaterial({ color: 0x3e5c88 });
    const torsoMesh = new THREE.Mesh(torsoGeom, torsoMat);
    group.add(torsoMesh);

    // Legs: each leg is a group with its own pivot at the hip to allow
    // animation.  A cylinder is created with its local origin at the top
    // (hip) so that rotating the group causes the leg to swing
    // forward/backwards around the hip joint.  Two leg groups are
    // positioned relative to the torso.
    const legGeom = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 12);
    // Shift the geometry so the hip joint is at the group's origin.
    legGeom.translate(0, -legHeight / 2, 0);
    const legMat  = new THREE.MeshStandardMaterial({ color: 0x2e4372 });
    // Left leg
    leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-bodyRadius * 0.4, 0, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, legMat);
    leftLegGroup.add(leftLegMesh);
    group.add(leftLegGroup);
    // Right leg
    rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(bodyRadius * 0.4, 0, 0);
    const rightLegMesh = new THREE.Mesh(legGeom.clone(), legMat);
    rightLegGroup.add(rightLegMesh);
    group.add(rightLegGroup);

    // Arms: similarly, create arm groups with local origins at the
    // shoulder.  Arms hang downwards initially (aligned along the
    // negative Y axis) and will swing forward/backwards by rotating
    // around the X axis.  Attach arms near the top of the torso.
    const armGeom = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 12);
    // Position the geometry so the shoulder is at the origin; the
    // cylinder extends downward from the origin.
    armGeom.translate(0, -armLength / 2, 0);
    const armMat  = new THREE.MeshStandardMaterial({ color: 0x2e4372 });
    const shoulderHeight = bodyHeight * 0.8;
    // Left arm
    leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-bodyRadius - armRadius * 0.5, shoulderHeight, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, armMat);
    leftArmGroup.add(leftArmMesh);
    group.add(leftArmGroup);
    // Right arm
    rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(bodyRadius + armRadius * 0.5, shoulderHeight, 0);
    const rightArmMesh = new THREE.Mesh(armGeom.clone(), armMat);
    rightArmGroup.add(rightArmMesh);
    group.add(rightArmGroup);

    // Head and facial features.  Create a group to contain the head mesh,
    // eyes, pupils, mouth and helmet.  Position this group atop the
    // torso so that all children inherit the same transform and rotate
    // together with the avatar.
    const headGroup = new THREE.Group();
    headGroup.position.set(0, bodyHeight + headRadius, 0);

    // Primary head sphere
    const headGeom = new THREE.SphereGeometry(headRadius, 16, 12);
    const headMat  = new THREE.MeshStandardMaterial({ color: 0xffd7b1 });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headGroup.add(headMesh);

    // Eyes: white spheres with black pupils.  Create a helper function
    // to generate an eye given an offset along X.
    const eyeRadius   = headRadius * 0.2;
    const pupilRadius = eyeRadius * 0.4;
    function createEye(offsetX) {
      const eyeGroup = new THREE.Group();
      const scleraGeom = new THREE.SphereGeometry(eyeRadius, 8, 8);
      const scleraMat  = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const scleraMesh = new THREE.Mesh(scleraGeom, scleraMat);
      eyeGroup.add(scleraMesh);
      const pupilGeom  = new THREE.SphereGeometry(pupilRadius, 8, 8);
      const pupilMat   = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const pupilMesh  = new THREE.Mesh(pupilGeom, pupilMat);
      pupilMesh.position.set(0, 0, eyeRadius * 0.6);
      eyeGroup.add(pupilMesh);
      // Position the eye group relative to the head centre.  Eyes
      // protrude slightly along the Z axis (forward) and are offset
      // horizontally by offsetX and vertically slightly above the midline.
      eyeGroup.position.set(offsetX, eyeRadius * 0.2, headRadius * 0.8);
      return eyeGroup;
    }
    const leftEye  = createEye(-headRadius * 0.4);
    const rightEye = createEye( headRadius * 0.4);
    headGroup.add(leftEye);
    headGroup.add(rightEye);

    // Mouth: a small capsule/cylinder indicating a smile.  Use a thin
    // cylinder rotated to lay horizontal.  The mouth is positioned
    // slightly below the centre of the face and protrudes forward a bit.
    const mouthGeom = new THREE.CylinderGeometry(headRadius * 0.05, headRadius * 0.05, headRadius * 0.5, 8);
    // Rotate the cylinder so it lies horizontally (along the X axis).
    mouthGeom.rotateZ(Math.PI / 2);
    const mouthMat  = new THREE.MeshStandardMaterial({ color: 0xcc5544 });
    const mouthMesh = new THREE.Mesh(mouthGeom, mouthMat);
    mouthMesh.position.set(0, -headRadius * 0.3, headRadius * 0.8);
    headGroup.add(mouthMesh);

    // Helmet: a hemisphere slightly larger than the head.  Construct a
    // half sphere with phiLength of π/2 so that only the top cap is
    // rendered.  The helmet sits on the head with a small downward
    // offset to cover the forehead.
    const helmetGeom = new THREE.SphereGeometry(helmetRadius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const helmetMat  = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const helmetMesh = new THREE.Mesh(helmetGeom, helmetMat);
    helmetMesh.position.set(0, headRadius * 0.3, 0);
    headGroup.add(helmetMesh);

    group.add(headGroup);

    // Scale the avatar slightly to ensure it fits comfortably within a single tile.
    group.scale.set(1, 1, 1);
    // Position the avatar on the starting tile.  Place its feet at y=TILE_HEIGHT
    // so that the entire model stands on top of the tile.  A small
    // offset (0.02) avoids z‑fighting.
    const start = axialToWorld(charPosition.q, charPosition.r);
    group.position.set(start.x, TILE_HEIGHT + 0.02, start.z);
    character = group;
    // Store limb references on the avatar for easy access during animation.
    character.userData.limbs = {
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup
    };
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
          // Rotate the character to face the movement direction.  We
          // interpret the avatar’s default forward orientation as the
          // positive Z axis.  The rotation angle about the Y axis is
          // derived from the x and z components of the direction vector.
          const angle = Math.atan2(dir.x, dir.z);
          character.rotation.y = angle;
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
        // Keep the avatar slightly above the top of the tile.  Tiles
        // extend from y=0 to y=TILE_HEIGHT; placing the avatar at
        // TILE_HEIGHT+0.02 avoids z‑fighting.
        character.position.y = TILE_HEIGHT + 0.02;
        // Animate limbs to simulate a walk cycle.  We compute a swing
        // value using a sine wave that starts and ends at zero during
        // each movement step.  Arms and legs move in opposite phases to
        // approximate a natural gait.  If limb references are
        // available, update their rotations; this check guards against
        // undefined values in case the avatar hasn’t been fully
        // initialised.
        const swing = Math.sin(t * Math.PI);
        if (character.userData && character.userData.limbs) {
          const limbs = character.userData.limbs;
          if (limbs.leftArm)  limbs.leftArm.rotation.x  =  ARM_SWING * swing;
          if (limbs.rightArm) limbs.rightArm.rotation.x = -ARM_SWING * swing;
          if (limbs.leftLeg)  limbs.leftLeg.rotation.x  = -LEG_SWING * swing;
          if (limbs.rightLeg) limbs.rightLeg.rotation.x =  LEG_SWING * swing;
        }
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          // Reset limb rotations to neutral at the end of the step
          if (character.userData && character.userData.limbs) {
            const limbs = character.userData.limbs;
            if (limbs.leftArm)  limbs.leftArm.rotation.x  = 0;
            if (limbs.rightArm) limbs.rightArm.rotation.x = 0;
            if (limbs.leftLeg)  limbs.leftLeg.rotation.x  = 0;
            if (limbs.rightLeg) limbs.rightLeg.rotation.x = 0;
          }
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