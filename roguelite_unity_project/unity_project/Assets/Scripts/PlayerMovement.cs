using UnityEngine;

/// <summary>
/// Handles simple WASD movement for a top‑down player character.  The script
/// reads raw input axes each frame, normalizes the resulting vector and
/// applies movement in FixedUpdate via a Rigidbody2D.  It also moves the
/// main camera to follow the player's position so the game world stays
/// centered on the player.
/// </summary>
[RequireComponent(typeof(Rigidbody2D), typeof(BoxCollider2D))]
public class PlayerMovement : MonoBehaviour
{
    /// <summary>
    /// Movement speed in world units per second.
    /// </summary>
    public float speed = 5f;

    private Rigidbody2D rb;
    private Vector2 moveInput;

    private void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
        // Disable gravity for top‑down movement
        rb.gravityScale = 0f;
    }

    private void Update()
    {
        // Capture keyboard input (WASD / arrow keys)
        float moveX = Input.GetAxisRaw("Horizontal");
        float moveY = Input.GetAxisRaw("Vertical");
        moveInput = new Vector2(moveX, moveY);
        // Normalize so diagonal movement isn't faster
        if (moveInput.sqrMagnitude > 1f)
        {
            moveInput = moveInput.normalized;
        }
    }

    private void FixedUpdate()
    {
        // Compute the new position and move the rigidbody
        Vector2 newPos = rb.position + moveInput * speed * Time.fixedDeltaTime;
        rb.MovePosition(newPos);

        // Keep the camera centered on the player
        if (Camera.main != null)
        {
            Vector3 camPos = Camera.main.transform.position;
            Camera.main.transform.position = new Vector3(transform.position.x, transform.position.y, camPos.z);
        }
    }
}