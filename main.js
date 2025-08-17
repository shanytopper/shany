/*
 * main.js
 *
 * This file defines a simple third‑person game using Babylon.js.  The
 * architecture is intentionally split into small classes to promote
 * readability, reusability and testability.  Each class has a clear
 * responsibility (Single Responsibility Principle) and dependencies are
 * injected rather than hard‑coded (Dependency Inversion Principle).  These
 * patterns make the game easy to extend while keeping individual units
 * simple and cohesive.
 */

// Ensure the code executes after the DOM has fully loaded.  Because this
// module runs in strict mode, variables are scoped appropriately and we
// avoid leaking globals.
window.addEventListener("DOMContentLoaded", () => {
  const game = new Game("renderCanvas");
  game.start();
});

/**
 * Handles keyboard input for the scene.  Babylon.js exposes an
 * ActionManager which we attach to the scene to receive keyboard
 * notifications.  The InputController stores the pressed state of
 * individual keys so the player can query them during an update.
 */
class InputController {
  /**
   * @param {BABYLON.Scene} scene The scene that will emit keyboard events.
   */
  constructor(scene) {
    /**
     * Internal map of keys currently pressed.  The property names are
     * individual key values (for example "w" or "ArrowUp").  A value
     * of true indicates the key is currently pressed.
     * @type {Record<string, boolean>}
     */
    this._inputMap = {};
    // Attach an action manager to the scene if none exists.  Without this
    // keyboard events will not be propagated.
    if (!scene.actionManager) {
      scene.actionManager = new BABYLON.ActionManager(scene);
    }
    // When a key is pressed set its state to true.
    scene.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnKeyDownTrigger,
        (evt) => {
          this._inputMap[evt.sourceEvent.key.toLowerCase()] = true;
        }
      )
    );
    // When a key is released set its state to false.
    scene.actionManager.registerAction(
      new BABYLON.ExecuteCodeAction(
        BABYLON.ActionManager.OnKeyUpTrigger,
        (evt) => {
          this._inputMap[evt.sourceEvent.key.toLowerCase()] = false;
        }
      )
    );
  }
  /**
   * Returns true if the given key is currently pressed.
   * @param {string} key The key to test (case insensitive).
   */
  isKeyDown(key) {
    return !!this._inputMap[key.toLowerCase()];
  }
}

/**
 * Represents the controllable player character.  The player is loaded from a
 * free asset hosted by the Babylon.js asset library.  When movement keys
 * are pressed the player moves in the direction it is facing and an
 * animation is played.  The model and animations are loaded asynchronously.
 */
class Player {
  /**
   * @param {BABYLON.Scene} scene The scene to which the player belongs.
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {BABYLON.AbstractMesh} */
    this.mesh = null;
    /** @type {BABYLON.AnimationGroup[]} */
    this._animations = [];
    /**
     * Speed in units per second.  This property can be tuned to adjust how
     * quickly the player moves through the world.
     * @type {number}
     */
    this.speed = 3;
  }
  /**
   * Asynchronously loads the character model from the Babylon.js asset
   * repository.  The returned promise resolves when the model and all
   * animations are ready for use.
   *
   * We choose to separate loading from the constructor to avoid mixing
   * construction and resource retrieval (a violation of the Single
   * Responsibility Principle).  This also allows the caller to await
   * completion before starting the game loop.
   * @returns {Promise<void>}
   */
  async load() {
    try {
      // Try to load the free asset from the Babylon.js CDN.  Should this
      // fail (for example due to network restrictions) we fall back to a
      // procedurally created capsule so that testing can proceed locally.
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "", // import all meshes
        Player.rootUrl(),
        Player.filename(),
        this.scene
      );
      this.mesh = result.meshes[0];
      // When using glTF or .babylon assets the first entry in
      // meshes[] is typically a transform node that holds all child
      // meshes and skeletons.  We intentionally keep this root node
      // instead of selecting the first geometry, because the skeleton
      // influences are bound to this root.  Detaching the geometry
      // from its root can lead to mismatched scaling (floating heads,
      // giant feet, etc.).
      this.mesh.checkCollisions = false;
      // Capture all animation groups.  We don't assume any particular
      // naming convention for the groups; instead we simply pause
      // all groups until the player moves.  When moving we will
      // resume playback on every group.  Should your asset contain
      // multiple animations such as idle, walk, run etc. you can
      // further filter the groups by name (e.g. group.name.toLowerCase().includes("walk")).
      this._animations = result.animationGroups || [];
      // If the asset supplies skeletons but no animation groups, we
      // construct synthetic AnimationGroup objects that proxy calls
      // through beginAnimation and stopAnimation on the skeleton.  The
      // Dude model in particular provides animation ranges on its
      // skeleton rather than grouped animations.  We default to
      // playing frames 0–100 for walking; adjust these frame ranges
      // according to your own exported model.
      if (this._animations.length === 0 && result.skeletons && result.skeletons.length > 0) {
        const skel = result.skeletons[0];
        // Define a helper to start and stop skeleton animations
        const startAnimation = () => {
          // Loop frames 0 to 100 at normal speed
          this.scene.beginAnimation(skel, 0, 100, true, 1.0);
        };
        const stopAnimation = () => {
          this.scene.stopAnimation(skel);
        };
        // Push a proxy object that conforms to the AnimationGroup
        this._animations.push({
          play: (loop) => startAnimation(),
          pause: () => stopAnimation(),
          reset: () => {},
          isPaused: true,
        });
      }
      // Scale the model down to fit inside the room.  The Dude model is
      // roughly two metres tall.  Scaling by 0.1 brings the
      // character to a reasonable height relative to the Cornell Box.
      // TransformNode inherits scaling; assign a new vector to
      // uniformly scale the root and its skeleton.  Using a new
      // Vector3 avoids issues with in‑place scaling on uninitialised
      // scalars.
      this.mesh.scaling = new BABYLON.Vector3(0.1, 0.1, 0.1);
    } catch (err) {
      // Fallback: create a simple capsule to represent the character.  We
      // still set up a dummy animation that bobs the capsule up and down
      // when the player moves.
      console.warn("Failed to load player asset, using a capsule instead.", err);
      this.mesh = BABYLON.MeshBuilder.CreateCapsule(
        "playerCapsule",
        { height: 2, radius: 0.5, capSubdivisions: 4 },
        this.scene
      );
      this.mesh.checkCollisions = false;
      this.mesh.position.set(0, 1, 0);
      // Create a simple animation that moves the capsule up and down to
      // simulate walking.  The animation will be triggered manually
      // during update.
      const frameRate = 30;
      const bobKeys = [];
      bobKeys.push({ frame: 0, value: 0 });
      bobKeys.push({ frame: frameRate / 2, value: 0.1 });
      bobKeys.push({ frame: frameRate, value: 0 });
      const bobAnim = new BABYLON.Animation(
        "bob",
        "position.y",
        frameRate,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
      );
      bobAnim.setKeys(bobKeys);
      // Store the single animation in the array to unify logic.
      this._animations = [
        {
          play: (loop) => {
            this.scene.beginDirectAnimation(this.mesh, [bobAnim], 0, frameRate, loop);
          },
          pause: () => {
            // There is no direct pause for direct animations; simply stop
            // them by ending all animations on the mesh.
            this.scene.stopAnimation(this.mesh);
          },
          reset: () => {
            this.mesh.position.y = 1;
          },
          isPaused: true,
        },
      ];
    }
    // Position the player slightly above the ground to avoid clipping.
    this.mesh.position.y = 1;
    // Start playing the animations but immediately pause them.  We do
    // this so that the animation timelines are initialised.  When the
    // player begins moving we will resume playback.
    this._animations.forEach((ag) => {
      if (ag.reset) ag.reset();
      if (ag.play) ag.play(true);
      // Immediately pause so the idle pose is shown.
      if (ag.pause) ag.pause();
      ag.isPaused = true;
    });
  }
  /**
   * Updates the player's position based on currently pressed keys.  Called
   * each frame by the game loop.  The player will move forward/backwards
   * relative to its own forward direction and strafe left/right.  The
   * character's orientation is updated to face the direction of movement.
   *
   * @param {InputController} input The input controller to query keys from.
   * @param {number} deltaTime Seconds elapsed since last update.
   */
  update(input, deltaTime) {
    if (!this.mesh) return;
    // Determine which movement keys are pressed.  We use the camera's
    // orientation to translate these keys into world‑space vectors so
    // that pressing "W" always moves the player forward relative to
    // the camera, rather than along a fixed world axis.  This makes
    // controls intuitive for a third‑person game.
    const forwardPressed = input.isKeyDown("w") || input.isKeyDown("arrowup");
    const backwardPressed = input.isKeyDown("s") || input.isKeyDown("arrowdown");
    const leftPressed = input.isKeyDown("a") || input.isKeyDown("arrowleft");
    const rightPressed = input.isKeyDown("d") || input.isKeyDown("arrowright");

    // Compute the desired movement on the local forward (z) and right (x) axes.
    let inputX = 0;
    let inputZ = 0;
    if (forwardPressed) inputZ += 1;
    if (backwardPressed) inputZ -= 1;
    if (rightPressed) inputX += 1;
    if (leftPressed) inputX -= 1;

    // Only move if a directional key is pressed.
    if (inputX !== 0 || inputZ !== 0) {
      // Retrieve the active camera.  We expect a FollowCamera but
      // gracefully handle other camera types.  If there is no active
      // camera then fall back to world axes.
      const cam = this.scene.activeCamera;
      let forwardVec = new BABYLON.Vector3(0, 0, 1);
      let rightVec = new BABYLON.Vector3(1, 0, 0);
      if (cam) {
        // getDirection returns the direction of the local axis in world
        // space.  We ignore the y component to keep movement on the XZ
        // plane.  Note that camera.getDirection(Axis.Z) points
        // forward according to the camera definition.
        forwardVec = cam.getDirection(BABYLON.Axis.Z);
        forwardVec.y = 0;
        forwardVec.normalize();
        rightVec = cam.getDirection(BABYLON.Axis.X);
        rightVec.y = 0;
        rightVec.normalize();
      }
      // Combine the camera‑relative forward and right vectors.  Positive
      // inputZ moves forward and positive inputX moves right.  Multiply
      // inputZ by forwardVec and inputX by rightVec then add them.
      let moveDirection = forwardVec.scale(inputZ).add(rightVec.scale(inputX));
      // Normalise to prevent faster diagonal movement.
      if (moveDirection.lengthSquared() > 0) {
        moveDirection.normalize();
      }
      // Scale by movement speed and deltaTime to obtain per‑frame delta.
      const scaled = moveDirection.scale(this.speed * deltaTime);
      // Move the mesh while honouring collisions.  moveWithCollisions
      // expects a displacement vector in world space.
      if (typeof this.mesh.moveWithCollisions === "function") {
        this.mesh.moveWithCollisions(scaled);
      } else {
        this.mesh.position.addInPlace(scaled);
      }
      // Compute rotation so the character faces the direction of movement.
      // Note: atan2 takes arguments (y, x) for two‑dimensional vectors.
      const angle = Math.atan2(moveDirection.x, moveDirection.z);
      this.mesh.rotation.y = angle;
      // Resume animations when moving.
      this._animations.forEach((ag) => {
        if (ag.isPaused) {
          if (ag.play) {
            ag.play(true);
          }
          ag.isPaused = false;
        }
      });
    } else {
      // Pause animations when stationary.
      this._animations.forEach((ag) => {
        if (!ag.isPaused) {
          if (ag.pause) {
            ag.pause();
          }
          ag.isPaused = true;
        }
      });
    }
  }
  /**
   * Returns the root URL for the player asset.  Extracted into a static
   * method so that the path lives in one place and can easily be changed
   * without modifying the rest of the class.  If you need to host the
   * assets locally simply update this value accordingly.
   */
  static rootUrl() {
    // Babylon.js hosts many free assets on their CDN.  The path below is
    // publicly accessible and contains the Dude model along with its
    // textures.  See https://doc.babylonjs.com/toolsAndResources/assetLibraries/availableMeshes
    // for more information.  Note: if the asset fails to load at runtime
    // you can substitute this URL with your own hosted version of the
    // model.
    return "https://assets.babylonjs.com/meshes/Dude/";
  }
  /**
   * Returns the filename of the player asset within the root URL.
   */
  static filename() {
    return "dude.babylon";
  }
}

/**
 * Represents the 3D environment.  In this example a classic Cornell Box
 * (a small room used for lighting experiments) is loaded.  The asset
 * includes baked lighting information which improves the scene's realism
 * without needing a complex lighting setup.  You can replace this with
 * any other free environment by modifying the static rootUrl/filename
 * methods.
 */
class Environment {
  /**
   * @param {BABYLON.Scene} scene The scene in which to create the environment.
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {BABYLON.AbstractMesh[]} */
    this.meshes = [];
  }
  /**
   * Loads the environment from the Babylon.js asset library.  Once loaded
   * the meshes are positioned at the origin.  The Cornell Box comes with
   * appropriate scaling; no further transformation is required.
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "", // import entire scene
        Environment.rootUrl(),
        Environment.filename(),
        this.scene
      );
      this.meshes = result.meshes;
      this.meshes.forEach((m) => {
        m.checkCollisions = true;
      });
    } catch (err) {
      console.warn("Failed to load environment asset, constructing a simple room instead.", err);
      // Create a simple room using boxes for walls, floor and ceiling.
      const size = 10;
      // Floor
      const floor = BABYLON.MeshBuilder.CreateBox(
        "floor",
        { width: size, depth: size, height: 0.1 },
        this.scene
      );
      floor.position.y = -0.05;
      floor.checkCollisions = true;
      floor.material = new BABYLON.StandardMaterial("floorMat", this.scene);
      floor.material.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);
      // Ceiling
      const ceiling = floor.clone("ceiling");
      ceiling.position.y = 5;
      // Back wall
      const backWall = BABYLON.MeshBuilder.CreateBox(
        "backWall",
        { width: size, height: 5, depth: 0.1 },
        this.scene
      );
      backWall.position.z = -size / 2;
      backWall.position.y = 2.5;
      backWall.checkCollisions = true;
      backWall.material = new BABYLON.StandardMaterial("backMat", this.scene);
      backWall.material.diffuseColor = new BABYLON.Color3(0.8, 0.1, 0.1);
      // Front wall
      const frontWall = backWall.clone("frontWall");
      frontWall.position.z = size / 2;
      frontWall.material = new BABYLON.StandardMaterial("frontMat", this.scene);
      frontWall.material.diffuseColor = new BABYLON.Color3(0.1, 0.8, 0.1);
      // Left wall
      const leftWall = BABYLON.MeshBuilder.CreateBox(
        "leftWall",
        { width: 0.1, height: 5, depth: size },
        this.scene
      );
      leftWall.position.x = -size / 2;
      leftWall.position.y = 2.5;
      leftWall.checkCollisions = true;
      leftWall.material = new BABYLON.StandardMaterial("leftMat", this.scene);
      leftWall.material.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.8);
      // Right wall
      const rightWall = leftWall.clone("rightWall");
      rightWall.position.x = size / 2;
      rightWall.material = new BABYLON.StandardMaterial("rightMat", this.scene);
      rightWall.material.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.1);
      // Ceiling color
      ceiling.material = new BABYLON.StandardMaterial("ceilMat", this.scene);
      ceiling.material.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
      this.meshes = [floor, ceiling, backWall, frontWall, leftWall, rightWall];
    }
  }
  /**
   * Root URL to the environment.  Change this if hosting your own assets.
   */
  static rootUrl() {
    return "https://assets.babylonjs.com/meshes/CornellBox/";
  }
  /**
   * Filename of the environment model.  For the Cornell Box we import the
   * binary glTF (.glb) version because it packs textures into one file.
   */
  static filename() {
    return "cornellBox.glb";
  }
}

/**
 * Implements a simple third‑person follow camera.  Babylon.js provides a
 * FollowCamera type that automatically tracks a target mesh with a fixed
 * radius and height offset.  This wrapper encapsulates the configuration
 * and exposes a minimal API for updating when the player changes.
 */
class ThirdPersonCamera {
  /**
   * @param {BABYLON.AbstractMesh} target The mesh to follow.
   * @param {BABYLON.Scene} scene The scene to which the camera belongs.
   */
  constructor(target, scene) {
    this.scene = scene;
    this.target = target;
    // Create the camera and attach it to the canvas automatically when
    // constructed.  The radius determines the distance behind the player.
    this.camera = new BABYLON.FollowCamera(
      "followCam",
      new BABYLON.Vector3(0, 5, -10),
      scene
    );
    // Set the mesh that the camera should follow.
    this.camera.lockedTarget = target;
    // Set sensible defaults for a third‑person view.  You can tweak these
    // values to adjust how the camera behaves: radius controls the
    // distance from the target, heightOffset determines how high above
    // the target the camera sits, and rotationOffset determines the
    // horizontal angle relative to the forward direction.
    this.camera.radius = 8;
    this.camera.heightOffset = 3;
    this.camera.rotationOffset = 180; // look from behind
    // Attach controls to the active canvas so the user can orbit around
    // the character using the mouse wheel if desired.
    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);
  }
  /**
   * Updates the camera’s target.  This method can be called if the
   * controlled mesh changes at runtime.
   * @param {BABYLON.AbstractMesh} newTarget The new mesh to follow.
   */
  setTarget(newTarget) {
    this.camera.lockedTarget = newTarget;
  }
  /**
   * Optionally update additional camera properties each frame.  In this
   * simple example the FollowCamera handles everything internally so
   * there’s no work to do here.
   */
  update() {
    // The FollowCamera automatically updates its position and rotation
    // based on the locked target; nothing is required here.  This
    // placeholder exists to maintain parity with other updatable classes.
  }
}

/**
 * High level game coordinator.  Constructs the engine, scene, and
 * orchestrates the environment, player and camera.  The Game class
 * exposes a start() method that performs asynchronous loading before
 * starting the render loop.
 */
class Game {
  /**
   * @param {string} canvasId ID of the HTML canvas to render into.
   */
  constructor(canvasId) {
    /**
     * Reference to the HTML canvas element.  Passing this into the engine
     * ensures Babylon.js knows where to draw the frames.
     * @type {HTMLCanvasElement}
     */
    this.canvas = /** @type {HTMLCanvasElement} */ (
      document.getElementById(canvasId)
    );
    // Create the Babylon engine using the canvas.  Enable antialiasing for
    // smoother edges.  Pass the device pixel ratio to ensure crisp
    // rendering on high DPI displays.
    this.engine = new BABYLON.Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    /** @type {BABYLON.Scene} */
    this.scene = new BABYLON.Scene(this.engine);
    // Use a right‑handed coordinate system to align with glTF models.
    this.scene.useRightHandedSystem = true;
    /** @type {Environment} */
    this.environment = new Environment(this.scene);
    /** @type {Player} */
    this.player = new Player(this.scene);
    /** @type {ThirdPersonCamera} */
    this.camera = null;
    /** @type {InputController} */
    this.input = new InputController(this.scene);
  }
  /**
   * Loads all assets then begins the render loop.  Asynchronous
   * loading is awaited to ensure the game only starts once everything
   * is ready.  Exceptions propagate to the console to assist debugging.
   */
  async start() {
    try {
      // Show a basic loading UI while assets load.
      this.engine.displayLoadingUI();
      // Load environment and player in parallel.
      await Promise.all([this.environment.load(), this.player.load()]);
      // Create the follow camera after the player has been loaded.  The
      // constructor attaches the camera to the scene and sets defaults.
      this.camera = new ThirdPersonCamera(this.player.mesh, this.scene);
      // Set the created camera as the active camera for the scene.  Without
      // this assignment Babylon.js may default to another camera which
      // prevents our movement logic from using the correct orientation.
      this.scene.activeCamera = this.camera.camera;
      // Add a light so the model is visible.  The Cornell Box asset has
      // baked lighting but additional lights improve the player visibility.
      const light = new BABYLON.HemisphericLight(
        "hemilight",
        new BABYLON.Vector3(0, 1, 0),
        this.scene
      );
      light.intensity = 0.6;
      // Hide the loading UI now that everything is ready.
      this.engine.hideLoadingUI();
      // Start the render loop.  Each iteration we update the player based
      // on keyboard input and then render the scene.
      let lastFrameTime = performance.now();
      this.engine.runRenderLoop(() => {
        const now = performance.now();
        const deltaTime = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        this.player.update(this.input, deltaTime);
        if (this.camera) {
          this.camera.update();
        }
        this.scene.render();
      });
      // Resize the engine when the window size changes.  Without this the
      // canvas dimensions will become incorrect when resizing the browser.
      window.addEventListener("resize", () => {
        this.engine.resize();
      });
    } catch (err) {
      console.error("Error during game startup", err);
      this.engine.hideLoadingUI();
    }
  }
}