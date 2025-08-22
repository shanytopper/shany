using UnityEngine;

/// <summary>
/// Generates a simple rectangular dungeon room at runtime.  The room
/// dimensions can be adjusted via the public width and height fields.  The
/// border tiles use a wall sprite and are given colliders to block the
/// player, while interior tiles use a floor sprite.  A player character
/// prefab is spawned at the centre of the room and configured with
/// movement and collision components.
/// </summary>
public class RoomGenerator : MonoBehaviour
{
    /// <summary>
    /// Number of tiles horizontally.
    /// </summary>
    public int width = 15;

    /// <summary>
    /// Number of tiles vertically.
    /// </summary>
    public int height = 10;

    /// <summary>
    /// Resource path (within a Resources folder) to the floor sprite.
    /// </summary>
    public string floorSpritePath = "Sprites/floor";

    /// <summary>
    /// Resource path to the wall sprite.
    /// </summary>
    public string wallSpritePath = "Sprites/wall";

    /// <summary>
    /// Resource path to the player sprite.
    /// </summary>
    public string playerSpritePath = "Sprites/player";

    /// <summary>
    /// Speed to assign to the player movement.
    /// </summary>
    public float playerMoveSpeed = 5f;

    private void Start()
    {
        GenerateRoom();
    }

    private void GenerateRoom()
    {
        // Load sprites from the Resources folder.  The user can replace these
        // files without changing code as long as the resource paths match.
        Sprite floorSprite = Resources.Load<Sprite>(floorSpritePath);
        Sprite wallSprite = Resources.Load<Sprite>(wallSpritePath);
        Sprite playerSprite = Resources.Load<Sprite>(playerSpritePath);

        if (floorSprite == null || wallSprite == null || playerSprite == null)
        {
            Debug.LogError("One or more sprites could not be loaded. Check the resource paths.");
            return;
        }

        // Determine a scaling factor so a tile occupies exactly 1 unity unit in world
        float tileScaleX = 1f / floorSprite.bounds.size.x;
        float tileScaleY = 1f / floorSprite.bounds.size.y;
        Vector3 tileScale = new Vector3(tileScaleX, tileScaleY, 1f);

        // Create each tile in the room grid
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                bool isBorder = (x == 0 || y == 0 || x == width - 1 || y == height - 1);
                Sprite currentSprite = isBorder ? wallSprite : floorSprite;

                GameObject tile = new GameObject($"Tile_{x}_{y}");
                SpriteRenderer sr = tile.AddComponent<SpriteRenderer>();
                sr.sprite = currentSprite;
                tile.transform.position = new Vector3(x, y, 0f);
                tile.transform.localScale = tileScale;

                // Border tiles receive colliders to block the player
                if (isBorder)
                {
                    BoxCollider2D col = tile.AddComponent<BoxCollider2D>();
                    col.size = Vector2.one;
                    col.offset = Vector2.zero;
                    // Static colliders without a Rigidbody2D are sufficient for collisions
                }
            }
        }

        // Spawn the player character roughly in the centre of the room
        GameObject player = new GameObject("Player");
        SpriteRenderer psr = player.AddComponent<SpriteRenderer>();
        psr.sprite = playerSprite;

        // Compute scaling so the player sprite also occupies 1 unit horizontally
        float playerScale = 1f / playerSprite.bounds.size.x;
        player.transform.localScale = new Vector3(playerScale, playerScale, 1f);
        player.transform.position = new Vector3(width / 2f, height / 2f, 0f);

        // Add collider and rigidbody for collision handling
        BoxCollider2D pCol = player.AddComponent<BoxCollider2D>();
        pCol.size = Vector2.one;
        pCol.offset = Vector2.zero;
        Rigidbody2D pRb = player.AddComponent<Rigidbody2D>();
        pRb.gravityScale = 0f;
        pRb.constraints = RigidbodyConstraints2D.FreezeRotation;

        // Assign the movement script
        PlayerMovement movement = player.AddComponent<PlayerMovement>();
        movement.speed = playerMoveSpeed;
    }
}