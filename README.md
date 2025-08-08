# Roguelite Proof of Concept (Improved)

This repository contains an evolving proof‑of‑concept for a top‑down roguelike game inspired by **Hades** and **The Binding of Isaac**.  The core engine is written with **Pygame** and follows SOLID principles and clean coding standards.

## Features

* **Randomly generated dungeon** – rooms are linked in a branching layout, ensuring every playthrough is slightly different.  A breadth‑first search test verifies the dungeon remains fully connected.
* **Hero movement and combat** – move with `WASD` or arrow keys, shoot with the spacebar.  The hero sprite uses four‑frame walk cycles for each direction.  A dash ability (hold Shift) multiplies your speed and grants temporary invulnerability.
* **Enemy variety** – melee enemies chase the player; ranged enemies move slower but shoot projectiles on a cooldown.  **Turret enemies** sit in place but unleash bullets in all eight directions.  **Splitter enemies** break apart into two smaller minis upon death.  **Teleporters** periodically vanish and reappear elsewhere in the room.  **Bosses** appear in the final room, firing radial spreads of bullets and periodically summoning additional minions.
* **Potions** – randomly spawn and heal the player by 25 health points upon collection.
* **Upgrades** – after clearing a room (except the final boss room) a random upgrade item appears.  Upgrades can increase bullet damage, decrease your firing cooldown, boost movement speed or increase maximum health.  Additional upgrades introduced in later iterations include **Spread Shot** (fire multiple bullets at once), **Shield** (absorb incoming hits), **Bomb** (gain a deployable bomb that explodes after a short fuse) and more.
* **Heads‑up display, minimap and menus** – displays current health and room number during gameplay.  A minimap in the top right corner shows the dungeon layout and visited rooms.  A start menu shows your best time and kill count, and the game over screen summarises your performance.  You can pause and resume the game with **P**.
* **Unit tests** – the `tests` directory contains `pytest` tests verifying dungeon connectivity, dash mechanics, upgrade effects (including spread shot and shield), boss radial attacks and turret firing patterns.  Run `pytest` to ensure regressions are caught.

* **Currency and shops** – slain enemies and destroyed barrels drop gold coins.  Your current gold balance is displayed beside the health bar.  Some rooms are designated shops: instead of enemies they contain purchasable upgrades drawn from a curated list.  Stand on an item and press **E** to buy it if you have enough gold.  Purchased upgrades immediately apply their effects.
* **Barrels and traps** – rooms may contain destructible barrels.  Blast them with bullets or bombs to reveal additional coins or the occasional potion.  Spike traps periodically extend and retract; stepping on a trap while it is active inflicts damage (or consumes a shield).

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

* Plant Bomb: **B** (if you have bombs from upgrades; bomb explodes after a short fuse)
* Pause/Resume: **P** (toggle pause during gameplay)
* Purchase Item: **E** (in shop rooms, stand on an item and press **E** to buy it if you have enough gold)

In the start menu or game over screen:

* **Enter/Space** – start or restart a run
* **Escape** – return to the menu from the game over screen

## Assets

The hero sprite derives from Bukket Games’ CC‑BY sprite sheet (four‑frame walking animations)【696022837860084†L123-L135】; credit is required when distributing the game.  All other graphics (enemies, potions and bullets) are programmatically drawn.

## Roadmap

* More enemy types and environmental hazards (e.g. new trap patterns, elemental turrets, roaming minibosses)
* Additional items and power‑ups (e.g. elemental attacks, area‑of‑effect spells) and a greater variety of shop upgrades
* Sound effects and music
* Difficulty settings and persistent high score tables
* Animated menus and game over screens

Contributions and feedback are welcome!