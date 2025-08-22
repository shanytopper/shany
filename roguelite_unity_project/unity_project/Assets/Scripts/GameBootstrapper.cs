using UnityEngine;

/// <summary>
/// Automatically constructs the game environment when a scene loads.  This
/// bootstrapper ensures a main camera exists, configures it for 2D use and
/// spawns a GameObject that runs the RoomGenerator.  By doing this at
/// runtime the project requires no preconfigured Unity scene and can be
/// opened from a completely empty project.
/// </summary>
public static class GameBootstrapper
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void Initialize()
    {
        // Ensure there's a main camera in the scene.  If none exists
        // Camera.main will return null, so we create one.  The z position
        // should be negative so the camera looks towards the positive z axis.
        Camera mainCamera = Camera.main;
        if (mainCamera == null)
        {
            GameObject camGO = new GameObject("Main Camera");
            camGO.tag = "MainCamera";
            mainCamera = camGO.AddComponent<Camera>();
        }

        // Configure the camera for top‑down 2D.  Orthographic projection
        // removes perspective distortion and size is handled via scaling.
        mainCamera.orthographic = true;
        mainCamera.transform.position = new Vector3(0f, 0f, -10f);

        // Instantiate the room generator.  This object will construct the
        // dungeon, walls and player when Start() is invoked.
        new GameObject("RoomGenerator").AddComponent<RoomGenerator>();
    }
}