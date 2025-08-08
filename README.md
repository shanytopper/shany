# Roguelite Proof of Concept (Improved)

This repository contains an evolving proof‑of‑concept for a top‑down roguelike game inspired by **Hades** and **The Binding of Isaac**.  The core engine is written with **Pygame** and follows SOLID principles and clean coding standards.

## Features

* **Randomly generated dungeon** – rooms are linked in a branching layout, ensuring every playthrough is slightly different.  A breadth‑first search test verifies the dungeon remains fully connected.
* **Hero movement and combat** – move with `WASD` or arrow keys, shoot with the spacebar.  The hero sprite uses four‑frame walk cycles for each direction.  A dash ability (hold Shift) multiplies your speed and grants temporary invulnerability.
* **Enemy variety** – melee enemies chase the player; ranged enemies move slower but shoot projectiles on a cooldown.  Enemy bullets damage the player unless they are dashing.
* **Potions** – randomly spawn and heal the player by 25 health points upon collection.
* **Heads‑up display** – displays current health and room number; temporary messages inform you when a room is cleared or the game ends.
* **Unit tests** – the `tests` directory contains simple `pytest` tests to verify dungeon connectivity and dash mechanics.  Run `pytest` to ensure regressions are caught.

## Running

```bash
pip install pygame==2.5.1 pytest
python main.py            # launch the game
pytest -q tests           # run unit tests
```

## Controls

* Move: **W**, **A**, **S**, **D** or arrow keys
* Shoot: **Spacebar** (fires in the last direction moved)
* Dash: **Shift** (brief invulnerability and speed boost, with a cooldown)

## Assets

The hero sprite derives from Bukket Games’ CC‑BY sprite sheet (four‑frame walking animations)【696022837860084†L123-L135】; credit is required when distributing the game.  All other graphics (enemies, potions and bullets) are programmatically drawn.

## Roadmap

* More enemy types (e.g. bosses, environmental hazards)
* Additional items and power‑ups (damage boosts, shields, new weapons)
* Sound effects and music
* Configurable difficulty and saved high scores
* Polished menus and game over screens

Contributions and feedback are welcome!