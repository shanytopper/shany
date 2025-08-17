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
    // The import process returns a collection of loaded meshes and
    // animation groups.  The identifier "him" is the name of the root
    // transform in the .babylon file.  Using a non‑empty mesh name here
    // filters the imported meshes to only those starting with that name.
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "", // import all meshes
      Player.rootUrl(),
      Player.filename(),
      this.scene
    );
    // The first entry in the meshes array is the root transform of the
    // imported model.  We store a reference to it for movement.
    this.mesh = result.meshes[0];
    // Turn off collisions for now to simplify the example.  You can
    // re‑enable this and define a bounding box later for more realism.
    this.mesh.checkCollisions = false;
    // Store the animation groups for later.  For the Dude model the
    // walking animation is contained in the first group.  See the asset
    // documentation for details.
    this._animations = result.animationGroups || [];
    // Scale the model to fit better inside the room.  Without scaling
    // the default model appears very large compared to the Cornell Box.
    this.mesh.scaling.scaleInPlace(0.015);
    // Position the model slightly above the ground to avoid clipping.
    this.mesh.position.set(0, 0, 0);
    // Start the idle animation if available.
    if (this._animations.length > 0) {
      this._animations.forEach((ag) => {
        ag.stop();
      });
      // Ensure the first animation loops by enabling looping on all
      // targeted animations.
      const first = this._animations[0];
      first.reset();
      first.loopAnimation = true;
      first.play(true);
    }
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
    // Compute direction vector in the XZ plane based on keyboard state.
    const forward = input.isKeyDown("w") || input.isKeyDown("arrowup");
    const backward = input.isKeyDown("s") || input.isKeyDown("arrowdown");
    const left = input.isKeyDown("a") || input.isKeyDown("arrowleft");
    const right = input.isKeyDown("d") || input.isKeyDown("arrowright");
    const direction = new BABYLON.Vector3(
      (right ? 1 : 0) - (left ? 1 : 0),
      0,
      (backward ? 1 : 0) - (forward ? 1 : 0)
    );
    if (direction.lengthSquared() > 0) {
      // Normalize direction and scale by speed and deltaTime.
      direction.normalize();
      const move = direction.scale(this.speed * deltaTime);
      // Rotate the movement vector by the player's current rotation so the
      // movement is relative to where the model is facing.  We only care
      // about yaw rotation here.
      const rotationY = this.mesh.rotation.y;
      const cos = Math.cos(rotationY);
      const sin = Math.sin(rotationY);
      const localX = move.x * cos - move.z * sin;
      const localZ = move.x * sin + move.z * cos;
      this.mesh.position.x += localX;
      this.mesh.position.z += localZ;
      // Update the mesh's orientation to face the direction of travel.
      const targetAngle = Math.atan2(direction.x, direction.z);
      this.mesh.rotation.y = targetAngle;
      // Play the walking animation if defined.
      if (this._animations.length > 0) {
        this._animations.forEach((ag) => ag.play(true));
      }
    } else {
      // When not moving, pause the animations at their first frame.
      if (this._animations.length > 0) {
        this._animations.forEach((ag) => ag.stop());
      }
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
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      "", // import entire scene
      Environment.rootUrl(),
      Environment.filename(),
      this.scene
    );
    this.meshes = result.meshes;
    // Optionally, enable collision for the environment to prevent the
    // player from leaving the room.  Here we demonstrate how to set
    // collisions on all imported meshes.  Later you can fine tune which
    // meshes participate in collision detection.
    this.meshes.forEach((m) => {
      m.checkCollisions = true;
    });
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