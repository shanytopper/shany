"""
Rogue‑Lite Proof‑of‑Concept (Pygame Edition)
================================================

This is a self‑contained proof of concept for a top‑down roguelike game
inspired by titles like *Hades* and *The Binding of Isaac*.  The goal of
this program is to demonstrate core mechanics—movement, shooting, enemy
pursuit, room transitions and random dungeon generation—while following
SOLID principles and clean code practices.  The game uses Pygame for
rendering and input; no additional libraries are required.

Classes are broken down into logical components: `Entity` and its
derivatives handle the behaviour of actors; `Room` and `Dungeon` manage
level structure; and `Game` orchestrates the loop.  Each class strives
to have a single responsibility and exposes a small API so that other
parts of the code can interact with it without knowledge of internal
details.

To run the game, execute this file with Python 3.  Use WASD to move,
spacebar to shoot and arrow keys to move as well.  Progress through
rooms by walking through the doorway and defeat all enemies to unlock
the next room.  Collect potions to restore health.  When you clear
the final room you win!  If your health reaches zero the game ends.

Author: OpenAI ChatGPT
Date: 2025‑08‑08
"""

from __future__ import annotations
import os
import sys
import math
import random
import pygame
import json
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


# -----------------------------------------------------------------------------
# Configuration constants
#
# These values can be tweaked to adjust gameplay feel.  They are grouped here
# to make it obvious which values constitute tunable parameters versus ones
# computed from other values in the code.
SCREEN_WIDTH: int = 800
SCREEN_HEIGHT: int = 600
ROOM_COUNT: int = 8
PLAYER_SPEED: float = 200.0
PLAYER_MAX_HEALTH: int = 100
BULLET_SPEED: float = 500.0
BULLET_RATE_MS: int = 250
ENEMY_SPEED: float = 80.0
ENEMY_MAX_HEALTH: int = 30
POTION_HEAL: int = 25

# Directions encoded as enumeration values (0‑3) for mapping frames.
UP, DOWN, LEFT, RIGHT = 0, 1, 2, 3

# Colours used throughout the game.  Use a limited palette for a cohesive look.
COLOR_BG = (27, 27, 43)         # dark bluish background
COLOR_WALL = (40, 40, 60)       # slightly lighter for room walls
COLOR_DOOR = (100, 100, 150)    # door outlines
COLOR_ENEMY = (168, 50, 50)     # red tinted enemies
COLOR_BULLET = (255, 215, 0)    # golden bullets
COLOR_HEALTH_BG = (68, 68, 68)
COLOR_HEALTH_FG_GOOD = (0, 170, 0)
COLOR_HEALTH_FG_WARN = (204, 204, 0)
COLOR_HEALTH_FG_BAD = (170, 0, 0)
COLOR_POTION = (0, 255, 136)

# Cooldowns and durations (ms)
DASH_COOLDOWN_MS: int = 600
DASH_DURATION_MS: int = 150
DASH_MULTIPLIER: float = 3.0

# Boss parameters
BOSS_HEALTH: int = 200
BOSS_BULLET_COUNT: int = 12
BOSS_BULLET_SPEED: float = 300.0
BOSS_SHOT_COOLDOWN_MS: int = 1500
BOSS_MINION_COOLDOWN_MS: int = 3000

# Probability of spawning a TurretEnemy instead of a normal or ranged enemy.  A value between 0 and 1.
TURRET_PROBABILITY: float = 0.15

# High score storage.  When the player wins the game, their run time and kill count
# are compared against the best recorded times and kills.  The high score is
# persisted in a JSON file so that subsequent sessions can display and update it.
HIGHSCORE_FILE: str = os.path.join(os.path.dirname(__file__), 'highscore.json')

# Splitter enemy parameters.  Splitter enemies split into smaller mini enemies upon
# death.  The probability controls how often they spawn in place of a normal
# enemy, and the mini enemy stats define their health and speed.
SPLITTER_PROBABILITY: float = 0.15
MINI_ENEMY_HEALTH: int = 10
MINI_ENEMY_SPEED: float = ENEMY_SPEED * 1.3

# Bomb parameters.  Bombs are obtained via upgrades and can be deployed by
# pressing the 'B' key.  After a short fuse they explode, dealing area‑of‑effect
# damage to all enemies within the given radius.
BOMB_FUSE_MS: int = 1000
BOMB_RADIUS: float = 80.0
BOMB_DAMAGE: int = 40

# Upgrade definitions.  When a room (except the last) is cleared, an upgrade
# spawns.  The upgrade chosen randomly from this set will modify the player
# stat indicated by the provided lambda.
UPGRADE_TYPES = {
    'Power Up': lambda p: setattr(p, 'bullet_damage', p.bullet_damage + 5),
    'Rapid Fire': lambda p: setattr(p, 'fire_rate_ms', max(50, p.fire_rate_ms - 50)),
    'Fleet Feet': lambda p: setattr(p, 'speed', p.speed + 40),
    'Vitality': lambda p: (setattr(p, 'max_health', p.max_health + 20), setattr(p, 'health', min(p.max_health + 20, p.health + 20))),
    # Fire additional bullets per shot.  Spread Shot increases bullet_count by 2 up to a maximum of 5.
    'Spread Shot': lambda p: setattr(p, 'bullet_count', min(5, p.bullet_count + 2)),
    # Grant a protective shield that absorbs one incoming hit.
    'Shield': lambda p: setattr(p, 'shield', p.shield + 1),
    # Grant the player an additional bomb.  Bombs can be deployed with the 'B'
    # key and explode after a short fuse, damaging nearby enemies.
    'Bomb': lambda p: setattr(p, 'bombs', p.bombs + 1),
}



# -----------------------------------------------------------------------------
# Utility functions

def rand_int(a: int, b: int) -> int:
    """Return a random integer N such that a <= N <= b."""
    return random.randint(a, b)


def opposite_direction(dir: int) -> int:
    return {UP: DOWN, DOWN: UP, LEFT: RIGHT, RIGHT: LEFT}[dir]


# -----------------------------------------------------------------------------
# Data classes for Rooms and Dungeons

@dataclass
class Room:
    """Metadata about a single dungeon room."""
    index: int
    neighbors: Dict[int, int]
    enemy_count: int
    has_potion: bool
    cleared: bool = False


class Dungeon:
    """Generate and manage a collection of rooms with random connections."""
    def __init__(self, count: int) -> None:
        self.rooms: List[Room] = []
        for i in range(count):
            # placeholder neighbors; actual connections assigned later
            self.rooms.append(Room(index=i, neighbors={}, enemy_count=rand_int(2, 4), has_potion=(random.random() < 0.4)))
        self._create_connections()

    def _create_connections(self) -> None:
        """
        Connect each room to the next to form a guaranteed linear chain, with
        random direction assignments.  This simplified algorithm avoids
        connectivity bugs and ensures every room is reachable.  Additional
        connections could be added in the future to introduce loops.
        """
        dirs = [UP, DOWN, LEFT, RIGHT]
        for i in range(len(self.rooms) - 1):
            available = dirs.copy()
            random.shuffle(available)
            connected = False
            for d in available:
                if d in self.rooms[i].neighbors:
                    continue
                opp = opposite_direction(d)
                if opp in self.rooms[i + 1].neighbors:
                    continue
                self.rooms[i].neighbors[d] = i + 1
                self.rooms[i + 1].neighbors[opp] = i
                connected = True
                break
            if not connected:
                # fallback to RIGHT/LEFT connection
                self.rooms[i].neighbors[RIGHT] = i + 1
                self.rooms[i + 1].neighbors[LEFT] = i

    def _connect_rooms(self, i: int, target: int, dirs: List[int]) -> None:
        """Connect room i with room `target` if possible using a free direction."""
        available = dirs.copy()
        random.shuffle(available)
        for d in available:
            if d in self.rooms[target].neighbors:
                continue
            opp = opposite_direction(d)
            if opp in self.rooms[i].neighbors:
                continue
            # connect target -> i
            self.rooms[target].neighbors[d] = i
            self.rooms[i].neighbors[opp] = target
            return
        # If no direction was free on either room, force a connection by overwriting an unused direction.
        for d in dirs:
            if d not in self.rooms[target].neighbors:
                opp = opposite_direction(d)
                # remove any existing connection on this side
                # but we don't remove opposite's previous neighbor to avoid breaking existing graph
                self.rooms[target].neighbors[d] = i
                self.rooms[i].neighbors[opp] = target
                return

    def get_room(self, index: int) -> Room:
        return self.rooms[index]


# -----------------------------------------------------------------------------
# Entity hierarchy

class Entity:
    """Base class for all moving actors with health."""
    def __init__(self, x: float, y: float, width: int, height: int, health: int) -> None:
        self.rect = pygame.Rect(x, y, width, height)
        self.vel = pygame.Vector2(0, 0)
        self.max_health = health
        self.health = health
        self.alive = True

    def update(self, dt: float) -> None:
        # Move by velocity * delta time
        self.rect.x += self.vel.x * dt
        self.rect.y += self.vel.y * dt

    def draw(self, surface: pygame.Surface) -> None:
        # default: draw rectangle (override in subclasses)
        pygame.draw.rect(surface, (255, 255, 255), self.rect)

    def damage(self, amount: int) -> None:
        self.health -= amount
        if self.health <= 0:
            self.alive = False

    def heal(self, amount: int) -> None:
        self.health = min(self.max_health, self.health + amount)


class Player(Entity):
    """Player controlled by keyboard input and animated via sprite sheet."""
    def __init__(self, x: float, y: float, frames: Dict[int, List[pygame.Surface]]) -> None:
        super().__init__(x, y, 32, 48, PLAYER_MAX_HEALTH)
        # Core attributes
        self.speed: float = PLAYER_SPEED
        self.bullet_damage: int = 15  # initial damage per bullet
        self.fire_rate_ms: int = BULLET_RATE_MS  # rate of fire in milliseconds
        self.frames = frames  # map of direction to list of frames
        self.frame_index = 0
        self.animation_time = 0.0
        self.animation_rate = 0.12  # seconds per frame
        self.direction: int = DOWN
        self.last_direction: int = DOWN
        self.last_shot_time: float = 0.0
        self.bullets: List[Bullet] = []

        # Dash mechanics
        self.dash_time_remaining: float = 0.0  # ms remaining in current dash
        self.last_dash_time: float = 0.0
        self.invulnerable: bool = False

        # Additional combat attributes
        # Number of bullets fired per shot (spread shot).  Starts at 1 and can be
        # increased via upgrades.
        self.bullet_count: int = 1
        # Shield points; each point absorbs one hit from enemies or bullets
        self.shield: int = 0
        # Number of bombs available; bombs can be planted with the 'B' key
        self.bombs: int = 0


    def handle_input(self, keys: pygame.key.ScancodeWrapper, dt: float) -> None:
        self.vel.update(0, 0)
        moving = False
        if keys[pygame.K_a] or keys[pygame.K_LEFT]:
            self.vel.x = -self.speed
            self.direction = LEFT
            moving = True
        if keys[pygame.K_d] or keys[pygame.K_RIGHT]:
            self.vel.x = self.speed
            self.direction = RIGHT
            moving = True
        if keys[pygame.K_w] or keys[pygame.K_UP]:
            self.vel.y = -self.speed
            self.direction = UP
            moving = True
        if keys[pygame.K_s] or keys[pygame.K_DOWN]:
            self.vel.y = self.speed
            self.direction = DOWN
            moving = True
        # Normalize diagonal movement
        if self.vel.length_squared() > 0:
            self.vel = self.vel.normalize() * self.speed
            # Apply dash multiplier if currently dashing
            if self.dash_time_remaining > 0:
                self.vel *= DASH_MULTIPLIER
        # Update last direction if moving
        if moving:
            self.last_direction = self.direction
            self.animation_time += dt
            if self.animation_time >= self.animation_rate:
                self.animation_time -= self.animation_rate
                self.frame_index = (self.frame_index + 1) % len(self.frames[self.direction])
        else:
            # reset animation
            self.frame_index = 0
            self.animation_time = 0.0
        # Shooting
        now = pygame.time.get_ticks()
        if keys[pygame.K_SPACE]:
            # Use player's personal fire rate when deciding if a new bullet can be fired
            if now - self.last_shot_time >= self.fire_rate_ms:
                self.last_shot_time = now
                direction = self.last_direction
                self.shoot(direction)

        # Dash (shift) mechanics
        if keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]:
            # Initiate dash if cooldown elapsed
            if now - self.last_dash_time >= DASH_COOLDOWN_MS and self.dash_time_remaining <= 0:
                self.last_dash_time = now
                self.dash_time_remaining = DASH_DURATION_MS
                self.invulnerable = True

    def shoot(self, direction: int) -> None:
        """
        Fire a bullet in the specified direction.  The bullet's initial
        position is at the centre of the player.  The velocity is derived
        from the global BULLET_SPEED and the chosen direction.  The bullet's
        damage is tied to the player's current bullet_damage stat.
        """
        cx = self.rect.centerx
        cy = self.rect.centery
        # Determine base angle for the chosen direction (in degrees)
        if direction == UP:
            base_angle = -90.0  # up is -90 degrees
        elif direction == DOWN:
            base_angle = 90.0
        elif direction == LEFT:
            base_angle = 180.0
        else:  # RIGHT
            base_angle = 0.0
        # Spread angle between bullets (degrees).  A modest spread keeps shots controlled.
        spread_deg = 15.0
        # Compute starting offset so that bullets are centred around the base angle
        total_spread = spread_deg * (self.bullet_count - 1)
        for i in range(self.bullet_count):
            angle_deg = base_angle - total_spread / 2 + i * spread_deg
            angle_rad = math.radians(angle_deg)
            vx = math.cos(angle_rad) * BULLET_SPEED
            vy = math.sin(angle_rad) * BULLET_SPEED
            bullet = Bullet(cx, cy, vx, vy)
            bullet.damage = self.bullet_damage
            self.bullets.append(bullet)

    def update(self, dt: float) -> None:
        super().update(dt)
        # Constrain to screen bounds
        self.rect.clamp_ip(pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT))
        # Update bullets
        for bullet in self.bullets:
            bullet.update(dt)
        # Remove inactive bullets
        self.bullets = [b for b in self.bullets if b.alive]

        # Handle dash timing.  When dashing, multiply velocity; once expired,
        # remove invulnerability.  dt is in seconds so convert to ms.
        if self.dash_time_remaining > 0:
            self.dash_time_remaining -= dt * 1000.0
            # Increase speed while dashing (applied in handle_input for this frame)
        else:
            if self.invulnerable:
                self.invulnerable = False

    def draw(self, surface: pygame.Surface) -> None:
        # Draw player sprite
        frame = self.frames[self.last_direction][self.frame_index]
        surface.blit(frame, self.rect.topleft)
        # Draw bullets
        for bullet in self.bullets:
            bullet.draw(surface)


class Bullet:
    """Projectiles fired by the player."""
    def __init__(self, x: float, y: float, vx: float, vy: float) -> None:
        self.pos = pygame.Vector2(x, y)
        self.vel = pygame.Vector2(vx, vy)
        self.radius = 4
        self.alive = True
        self.damage = 15

    def update(self, dt: float) -> None:
        self.pos += self.vel * dt
        # Mark dead if off screen
        if (self.pos.x < 0 or self.pos.x > SCREEN_WIDTH or
                self.pos.y < 0 or self.pos.y > SCREEN_HEIGHT):
            self.alive = False

    def draw(self, surface: pygame.Surface) -> None:
        if self.alive:
            pygame.draw.circle(surface, COLOR_BULLET, (int(self.pos.x), int(self.pos.y)), self.radius)


class EnemyBullet(Bullet):
    """Projectiles fired by enemies toward the player."""
    def __init__(self, x: float, y: float, vx: float, vy: float) -> None:
        super().__init__(x, y, vx, vy)
        self.radius = 5
        self.damage = 10

    def draw(self, surface: pygame.Surface) -> None:
        if self.alive:
            pygame.draw.circle(surface, COLOR_ENEMY, (int(self.pos.x), int(self.pos.y)), self.radius)


class Enemy(Entity):
    """Simple enemy that chases the player."""
    def __init__(self, x: float, y: float) -> None:
        super().__init__(x, y, 32, 32, ENEMY_MAX_HEALTH)
        self.speed = ENEMY_SPEED

    def update(self, dt: float, player: Player) -> None:
        if not self.alive:
            return
        # Move towards player
        dx = player.rect.centerx - self.rect.centerx
        dy = player.rect.centery - self.rect.centery
        dist = math.hypot(dx, dy)
        if dist > 0:
            self.vel.x = (dx / dist) * self.speed
            self.vel.y = (dy / dist) * self.speed
        super().update(dt)
        # Constrain
        self.rect.clamp_ip(pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT))

    def draw(self, surface: pygame.Surface) -> None:
        pygame.draw.rect(surface, COLOR_ENEMY, self.rect)


class RangedEnemy(Enemy):
    """Enemy that chases the player and occasionally fires projectiles."""
    def __init__(self, x: float, y: float) -> None:
        super().__init__(x, y)
        self.cooldown_ms: int = 1500
        self.last_shot_time: float = 0.0
        # slightly slower
        self.speed = ENEMY_SPEED * 0.6
        # store bullets
        self.bullets: List[EnemyBullet] = []

    def update(self, dt: float, player: Player) -> None:
        # Move like a normal enemy
        super().update(dt, player)
        # Fire at intervals
        now = pygame.time.get_ticks()
        if now - self.last_shot_time >= self.cooldown_ms:
            self.last_shot_time = now
            # compute direction to player
            dx = player.rect.centerx - self.rect.centerx
            dy = player.rect.centery - self.rect.centery
            dist = math.hypot(dx, dy)
            if dist > 0:
                vx = (dx / dist) * BULLET_SPEED * 0.6
                vy = (dy / dist) * BULLET_SPEED * 0.6
                bullet = EnemyBullet(self.rect.centerx, self.rect.centery, vx, vy)
                self.bullets.append(bullet)
        # update bullets
        for b in self.bullets:
            b.update(dt)
        # remove dead bullets
        self.bullets = [b for b in self.bullets if b.alive]

    def draw(self, surface: pygame.Surface) -> None:
        # draw body
        pygame.draw.rect(surface, (100, 40, 140), self.rect)
        # draw bullets
        for b in self.bullets:
            b.draw(surface)


class TurretEnemy(Entity):
    """Enemy that remains stationary but fires bullets in multiple directions."""
    def __init__(self, x: float, y: float) -> None:
        super().__init__(x, y, 32, 32, ENEMY_MAX_HEALTH)
        # Turret does not move
        self.cooldown_ms: int = 1200
        self.last_shot_time: float = 0.0
        self.bullets: List[EnemyBullet] = []
        self.color = (200, 120, 40)

    def update(self, dt: float, player: Player) -> None:
        # Turret does not chase the player
        now = pygame.time.get_ticks()
        if now - self.last_shot_time >= self.cooldown_ms:
            self.last_shot_time = now
            # Fire bullets in eight cardinal directions (45 degree increments)
            for i in range(8):
                angle = (math.pi / 4.0) * i
                vx = math.cos(angle) * BULLET_SPEED * 0.6
                vy = math.sin(angle) * BULLET_SPEED * 0.6
                self.bullets.append(EnemyBullet(self.rect.centerx, self.rect.centery, vx, vy))
        # Update bullets
        for b in self.bullets:
            b.update(dt)
        self.bullets = [b for b in self.bullets if b.alive]

    def draw(self, surface: pygame.Surface) -> None:
        pygame.draw.rect(surface, self.color, self.rect)
        for b in self.bullets:
            b.draw(surface)


class MiniEnemy(Enemy):
    """Small enemy spawned by a SplitterEnemy.  Moves quickly and has low health."""
    def __init__(self, x: float, y: float) -> None:
        super().__init__(x, y)
        # Smaller size than normal enemies
        self.rect = pygame.Rect(x, y, 24, 24)
        self.max_health = MINI_ENEMY_HEALTH
        self.health = MINI_ENEMY_HEALTH
        # Faster movement
        self.speed = MINI_ENEMY_SPEED

    def draw(self, surface: pygame.Surface) -> None:
        # Distinguish mini enemies by colour
        pygame.draw.rect(surface, (120, 200, 80), self.rect)


class SplitterEnemy(Enemy):
    """Enemy that splits into two mini enemies upon death."""
    def __init__(self, x: float, y: float) -> None:
        super().__init__(x, y)
        # Different colour to distinguish splitter
        self.color = (180, 120, 40)

    def draw(self, surface: pygame.Surface) -> None:
        pygame.draw.rect(surface, self.color, self.rect)

    def split(self) -> List[MiniEnemy]:
        """
        Create two MiniEnemy instances near the splitter's position.  Offsets are
        applied to prevent overlapping.  Returns the list of new enemies.
        """
        minis: List[MiniEnemy] = []
        for _ in range(2):
            offset_x = rand_int(-30, 30)
            offset_y = rand_int(-30, 30)
            mx = max(16, min(SCREEN_WIDTH - 16, self.rect.centerx + offset_x))
            my = max(16, min(SCREEN_HEIGHT - 16, self.rect.centery + offset_y))
            minis.append(MiniEnemy(mx - 12, my - 12))
        return minis


class Potion:
    """Collectible potion that heals the player."""
    def __init__(self, x: float, y: float) -> None:
        self.rect = pygame.Rect(x, y, 16, 16)
        self.collected = False

    def draw(self, surface: pygame.Surface) -> None:
        if not self.collected:
            pygame.draw.rect(surface, COLOR_POTION, self.rect)


class Upgrade:
    """Collectible upgrade that modifies a player attribute when picked up."""
    def __init__(self, name: str, effect, x: float, y: float) -> None:
        self.name = name
        self.effect = effect  # callable that takes a Player and applies the upgrade
        self.rect = pygame.Rect(x, y, 20, 20)
        self.collected = False

    def apply(self, player: Player) -> None:
        """Apply the upgrade to the player and mark as collected."""
        if not self.collected:
            # Some effects return a tuple (because of multiple setattrs) but we ignore the return value
            self.effect(player)
            self.collected = True

    def draw(self, surface: pygame.Surface) -> None:
        if not self.collected:
            # simple blue square for upgrades
            pygame.draw.rect(surface, (50, 150, 200), self.rect)


class Bomb:
    """A planted bomb that explodes after a fuse and damages nearby enemies."""
    def __init__(self, x: float, y: float) -> None:
        self.pos = pygame.Vector2(x, y)
        self.timer_ms: float = BOMB_FUSE_MS
        self.exploded: bool = False
        self.alive: bool = True

    def update(self, dt: float) -> None:
        if not self.exploded:
            self.timer_ms -= dt * 1000.0
            if self.timer_ms <= 0.0:
                self.exploded = True
                self.alive = False

    def draw(self, surface: pygame.Surface) -> None:
        # Draw a simple bomb as a grey circle; if exploded, draw nothing (explosion
        # effect handled elsewhere)
        if not self.exploded:
            pygame.draw.circle(surface, (100, 100, 100), (int(self.pos.x), int(self.pos.y)), 6)


class BossEnemy(Enemy):
    """Boss enemy that uses radial attacks and can spawn minions."""
    def __init__(self, x: float, y: float) -> None:
        # Boss has larger size and more health
        super().__init__(x, y)
        self.rect = pygame.Rect(x, y, 64, 64)
        self.max_health = BOSS_HEALTH
        self.health = BOSS_HEALTH
        # Boss moves slowly towards the player
        self.speed = ENEMY_SPEED * 0.4
        # Timers for special actions
        self.last_shot_time = 0.0
        self.last_minion_time = 0.0
        # Container for bullets fired by the boss
        self.bullets: List[EnemyBullet] = []
        # Boss-specific colour
        self.color = (200, 60, 200)

    def perform_radial_attack(self) -> None:
        """Fire a circular pattern of enemy bullets evenly spaced around 360 degrees."""
        for i in range(BOSS_BULLET_COUNT):
            angle = (2 * math.pi * i) / BOSS_BULLET_COUNT
            vx = math.cos(angle) * BOSS_BULLET_SPEED
            vy = math.sin(angle) * BOSS_BULLET_SPEED
            bullet = EnemyBullet(self.rect.centerx, self.rect.centery, vx, vy)
            self.bullets.append(bullet)

    def update(self, dt: float, player: Player) -> None:
        """Move slowly toward the player, perform radial attacks and spawn minions."""
        if not self.alive:
            return
        # Boss moves slowly toward player
        dx = player.rect.centerx - self.rect.centerx
        dy = player.rect.centery - self.rect.centery
        dist = math.hypot(dx, dy)
        if dist > 0:
            self.vel.x = (dx / dist) * self.speed
            self.vel.y = (dy / dist) * self.speed
        super().update(dt)
        # Constrain to screen
        self.rect.clamp_ip(pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT))
        # Radial bullet attack at intervals
        now = pygame.time.get_ticks()
        if now - self.last_shot_time >= BOSS_SHOT_COOLDOWN_MS:
            self.last_shot_time = now
            self.perform_radial_attack()
        # Spawn minions at intervals
        if now - self.last_minion_time >= BOSS_MINION_COOLDOWN_MS:
            self.last_minion_time = now
            # Spawn 2 minions around boss (random offset)
            return ['spawn_minions']
        # Update boss bullets
        for b in self.bullets:
            b.update(dt)
        self.bullets = [b for b in self.bullets if b.alive]
        return []

    def draw(self, surface: pygame.Surface) -> None:
        # Draw boss body
        pygame.draw.rect(surface, self.color, self.rect)
        # Draw boss bullets
        for b in self.bullets:
            b.draw(surface)


class Game:
    """High level orchestrator: runs the loop and manages rooms and entities."""
    def __init__(self) -> None:
        # Initialise Pygame and create the window.  We do this here rather than
        # inside run() so that tests which instantiate Game can still operate
        # with dummy drivers.
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Rogue‑Lite POC")
        self.clock = pygame.time.Clock()
        # Load hero frames once; this asset is reused across runs
        self.player_frames = self.load_hero_frames(os.path.join(os.path.dirname(__file__), 'hero.png'))
        # High score data: {"best_time": int or None, "best_kills": int or None}
        self.highscore: Dict[str, Optional[int]] = self.load_highscore()
        # State machine: 'MENU', 'GAME', 'GAME_OVER'
        self.state: str = 'MENU'
        # Keep track of whether high score has been updated this run (to avoid
        # repeatedly writing the file during the game over loop)
        self.saved_score: bool = False
        # Immediately reset the game to set up initial variables.  The
        # game is paused in the menu state until the player starts.
        self.reset_game()

    def load_hero_frames(self, path: str) -> Dict[int, List[pygame.Surface]]:
        sheet = pygame.image.load(path).convert_alpha()
        frames: Dict[int, List[pygame.Surface]] = {UP: [], DOWN: [], LEFT: [], RIGHT: []}
        # The sheet is 256x128 with 8 columns and 2 rows; each frame 32x64
        for row in range(2):
            for col in range(8):
                frame = sheet.subsurface(pygame.Rect(col * 32, row * 64, 32, 64))
                # assign frames: first 4 of row 0 -> UP, next 4 -> LEFT; row1: first 4 -> DOWN, next 4 -> RIGHT
                if row == 0:
                    if col < 4:
                        frames[UP].append(frame)
                    else:
                        frames[LEFT].append(frame)
                else:
                    if col < 4:
                        frames[DOWN].append(frame)
                    else:
                        frames[RIGHT].append(frame)
        return frames

    def load_room(self, index: int) -> None:
        room = self.dungeon.get_room(index)
        self.current_room_index = index
        # Reset lists
        self.enemies = []
        self.potions = []
        self.upgrades = []
        # Spawn enemies
        # If this is the final room, spawn a boss instead of regular enemies
        if index == ROOM_COUNT - 1:
            # Boss spawns at centre of screen
            self.enemies.append(BossEnemy(SCREEN_WIDTH / 2 - 32, SCREEN_HEIGHT / 2 - 32))
        else:
            for _ in range(room.enemy_count):
                x = rand_int(60, SCREEN_WIDTH - 60)
                y = rand_int(60, SCREEN_HEIGHT - 60)
                r = random.random()
                # Spawn Splitter, Turret, Ranged or Melee enemies based on probabilities.
                # Note: probabilities sum to less than 1; remaining share goes to melee.
                if r < SPLITTER_PROBABILITY:
                    self.enemies.append(SplitterEnemy(x, y))
                elif r < SPLITTER_PROBABILITY + TURRET_PROBABILITY:
                    self.enemies.append(TurretEnemy(x, y))
                elif r < SPLITTER_PROBABILITY + TURRET_PROBABILITY + 0.30:
                    self.enemies.append(RangedEnemy(x, y))
                else:
                    self.enemies.append(Enemy(x, y))
        # Spawn potion
        if room.has_potion:
            x = rand_int(60, SCREEN_WIDTH - 60)
            y = rand_int(60, SCREEN_HEIGHT - 60)
            self.potions.append(Potion(x, y))
        # Clear message
        self.message = None

    def show_message(self, text: str, duration: float = 2.0) -> None:
        self.message = text
        self.message_timer = duration

    def run(self) -> None:
        """
        Main game loop implementing a simple state machine.  The loop cycles
        between menu, gameplay and game over states based on the player's
        actions.  In the menu, pressing Enter starts a new game; in the
        game over state, Enter restarts and Esc returns to the menu.
        """
        while True:
            dt = self.clock.tick(60) / 1000.0  # delta time in seconds
            # Handle events (quit, key presses)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                # Handle bomb planting only during gameplay
                if event.type == pygame.KEYDOWN and self.state == 'GAME':
                    if event.key == pygame.K_b:
                        # Plant a bomb if available
                        if self.player.bombs > 0:
                            cx = self.player.rect.centerx
                            cy = self.player.rect.centery
                            self.bombs.append(Bomb(cx, cy))
                            self.player.bombs -= 1
            keys = pygame.key.get_pressed()

            # --- Menu state ---
            if self.state == 'MENU':
                # Check for start input
                if keys[pygame.K_RETURN] or keys[pygame.K_SPACE]:
                    self.reset_game()
                    self.state = 'GAME'
                # Draw the menu and continue
                self.draw_menu()
                continue

            # --- Game state ---
            if self.state == 'GAME':
                if not self.game_over:
                    # Update player
                    self.player.handle_input(keys, dt)
                    self.player.update(dt)
                    # Update enemies and collect boss commands
                    spawn_minion_requests: List[str] = []
                    for enemy in self.enemies:
                        result = enemy.update(dt, self.player)
                        if isinstance(enemy, BossEnemy) and isinstance(result, list):
                            spawn_minion_requests.extend(result)
                    # Bullet vs enemy collisions
                    for bullet in self.player.bullets:
                        for enemy in self.enemies:
                            if enemy.alive and bullet.alive and enemy.rect.collidepoint(bullet.pos):
                                enemy.damage(bullet.damage)
                                bullet.alive = False
                    # Enemy vs player collisions (melee)
                    for enemy in self.enemies:
                        if enemy.alive and self.player.rect.colliderect(enemy.rect):
                            if not self.player.invulnerable:
                                if self.player.shield > 0:
                                    self.player.shield -= 1
                                    self.show_message("Shield absorbed hit!", duration=1.5)
                                else:
                                    self.player.damage(10)
                            dx = enemy.rect.centerx - self.player.rect.centerx
                            dy = enemy.rect.centery - self.player.rect.centery
                            dist = max(math.hypot(dx, dy), 0.1)
                            enemy.rect.x += int((dx / dist) * 20)
                            enemy.rect.y += int((dy / dist) * 20)
                    # Enemy bullet collisions
                    enemy_bullets: List[EnemyBullet] = []
                    for e in self.enemies:
                        if isinstance(e, RangedEnemy):
                            enemy_bullets.extend(e.bullets)
                        elif isinstance(e, BossEnemy):
                            enemy_bullets.extend(e.bullets)
                        elif isinstance(e, TurretEnemy):
                            enemy_bullets.extend(e.bullets)
                    for b in enemy_bullets:
                        if b.alive and self.player.rect.collidepoint(b.pos):
                            if not self.player.invulnerable:
                                if self.player.shield > 0:
                                    self.player.shield -= 1
                                    self.show_message("Shield absorbed hit!", duration=1.5)
                                else:
                                    self.player.damage(b.damage)
                            b.alive = False
                    # Process boss spawn requests
                    if spawn_minion_requests:
                        for enemy in self.enemies:
                            if isinstance(enemy, BossEnemy):
                                for _ in spawn_minion_requests:
                                    offset_x = rand_int(-80, 80)
                                    offset_y = rand_int(-80, 80)
                                    mx = max(32, min(SCREEN_WIDTH - 32, enemy.rect.centerx + offset_x))
                                    my = max(32, min(SCREEN_HEIGHT - 32, enemy.rect.centery + offset_y))
                                    if random.random() < 0.25:
                                        self.enemies.append(RangedEnemy(mx, my))
                                    else:
                                        self.enemies.append(Enemy(mx, my))
                    # Potion pickup
                    for potion in self.potions:
                        if not potion.collected and self.player.rect.colliderect(potion.rect):
                            potion.collected = True
                            self.player.heal(POTION_HEAL)
                    # Upgrade pickup
                    for upgrade in self.upgrades:
                        if not upgrade.collected and self.player.rect.colliderect(upgrade.rect):
                            upgrade.apply(self.player)
                            self.show_message(f"Picked up {upgrade.name}!", duration=3.0)

                    # Update bombs and handle explosions
                    # Track bombs that explode during this frame
                    for bomb in list(self.bombs):
                        pre_exploded = bomb.exploded
                        bomb.update(dt)
                        if not pre_exploded and bomb.exploded:
                            # Bomb just exploded: damage all enemies within radius
                            for enemy in self.enemies:
                                if enemy.alive:
                                    dist = math.hypot(bomb.pos.x - enemy.rect.centerx, bomb.pos.y - enemy.rect.centery)
                                    if dist <= BOMB_RADIUS:
                                        enemy.damage(BOMB_DAMAGE)
                            # Show explosion message
                            self.show_message("Boom!", duration=1.0)
                    # Remove bombs that have exploded
                    self.bombs = [b for b in self.bombs if not b.exploded]
                    # Remove dead enemies, spawn splits and count kills
                    dead_count = 0
                    survivors: List[Enemy] = []
                    spawned_minis: List[Enemy] = []
                    for enemy in self.enemies:
                        if enemy.alive:
                            survivors.append(enemy)
                        else:
                            dead_count += 1
                            if isinstance(enemy, SplitterEnemy):
                                spawned_minis.extend(enemy.split())
                    # Update enemy list: survivors plus newly spawned minis
                    self.enemies = survivors + spawned_minis
                    # Increment kill counter by number of dead enemies (splitting does not affect kills)
                    self.kills += dead_count
                    # Check room cleared
                    if enemies_before > 0 and not self.enemies and not self.dungeon.get_room(self.current_room_index).cleared:
                        self.dungeon.get_room(self.current_room_index).cleared = True
                        if self.current_room_index != ROOM_COUNT - 1:
                            name, effect = random.choice(list(UPGRADE_TYPES.items()))
                            ux = rand_int(80, SCREEN_WIDTH - 80)
                            uy = rand_int(80, SCREEN_HEIGHT - 80)
                            self.upgrades.append(Upgrade(name, effect, ux, uy))
                        self.show_message("Room cleared!")
                    # Update message timer
                    if self.message:
                        self.message_timer -= dt
                        if self.message_timer <= 0:
                            self.message = None
                    # Room transitions
                    room = self.dungeon.get_room(self.current_room_index)
                    if room.cleared:
                        if self.player.rect.top <= 0 and UP in room.neighbors:
                            self.player.rect.top = SCREEN_HEIGHT - self.player.rect.height - 2
                            self.load_room(room.neighbors[UP])
                        elif self.player.rect.bottom >= SCREEN_HEIGHT - 1 and DOWN in room.neighbors:
                            self.player.rect.bottom = self.player.rect.height + 2
                            self.load_room(room.neighbors[DOWN])
                        elif self.player.rect.left <= 0 and LEFT in room.neighbors:
                            self.player.rect.left = SCREEN_WIDTH - self.player.rect.width - 2
                            self.load_room(room.neighbors[LEFT])
                        elif self.player.rect.right >= SCREEN_WIDTH - 1 and RIGHT in room.neighbors:
                            self.player.rect.right = self.player.rect.width + 2
                            self.load_room(room.neighbors[RIGHT])
                    # Check victory / defeat
                    if all(r.cleared for r in self.dungeon.rooms) and not self.game_over:
                        self.game_over = True
                        self.display_game_over_message(victory=True)
                        self.state = 'GAME_OVER'
                    if self.player.health <= 0 and not self.game_over:
                        self.game_over = True
                        self.display_game_over_message(victory=False)
                        self.state = 'GAME_OVER'
                # Draw gameplay scene
                self.screen.fill(COLOR_BG)
                pygame.draw.rect(self.screen, COLOR_WALL, pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), 4)
                room = self.dungeon.get_room(self.current_room_index)
                if room.cleared:
                    door_width = 60
                    door_thickness = 4
                    if UP in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, 0, door_width, door_thickness))
                    if DOWN in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, SCREEN_HEIGHT - door_thickness, door_width, door_thickness))
                    if LEFT in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(0, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
                    if RIGHT in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(SCREEN_WIDTH - door_thickness, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
                for potion in self.potions:
                    potion.draw(self.screen)
                for upgrade in self.upgrades:
                    upgrade.draw(self.screen)
                # Draw bombs
                for bomb in self.bombs:
                    bomb.draw(self.screen)
                for enemy in self.enemies:
                    enemy.draw(self.screen)
                self.player.draw(self.screen)
                self.draw_ui()
                if self.message:
                    self.draw_message(self.message)
                pygame.display.flip()
                continue

            # --- Game over state ---
            if self.state == 'GAME_OVER':
                # Save highscore once when game_over triggers (only if victory)
                if not self.saved_score:
                    elapsed_ms = pygame.time.get_ticks() - self.start_time
                    # Only update high score on victory (all rooms cleared)
                    if all(r.cleared for r in self.dungeon.rooms):
                        self.save_highscore(elapsed_ms, self.kills)
                    else:
                        # Even if not victorious, update best kills
                        self.save_highscore(elapsed_ms, self.kills)
                    self.saved_score = True
                # Allow restart or return to menu
                if keys[pygame.K_RETURN] or keys[pygame.K_SPACE]:
                    self.reset_game()
                    self.state = 'GAME'
                    continue
                if keys[pygame.K_ESCAPE]:
                    self.state = 'MENU'
                    continue
                # Draw final scene (similar to gameplay but no updates)
                self.screen.fill(COLOR_BG)
                pygame.draw.rect(self.screen, COLOR_WALL, pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), 4)
                room = self.dungeon.get_room(self.current_room_index)
                if room.cleared:
                    door_width = 60
                    door_thickness = 4
                    if UP in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, 0, door_width, door_thickness))
                    if DOWN in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, SCREEN_HEIGHT - door_thickness, door_width, door_thickness))
                    if LEFT in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(0, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
                    if RIGHT in room.neighbors:
                        pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(SCREEN_WIDTH - door_thickness, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
                for potion in self.potions:
                    potion.draw(self.screen)
                for upgrade in self.upgrades:
                    upgrade.draw(self.screen)
                for bomb in self.bombs:
                    bomb.draw(self.screen)
                for enemy in self.enemies:
                    enemy.draw(self.screen)
                self.player.draw(self.screen)
                self.draw_ui()
                if self.message:
                    self.draw_message(self.message)
                pygame.display.flip()

    def draw_ui(self) -> None:
        # Health bar background
        bar_x, bar_y, bar_w, bar_h = 16, 16, 200, 20
        pygame.draw.rect(self.screen, COLOR_HEALTH_BG, pygame.Rect(bar_x, bar_y, bar_w, bar_h))
        # Health bar fill
        ratio = self.player.health / self.player.max_health
        if ratio > 0.5:
            color = COLOR_HEALTH_FG_GOOD
        elif ratio > 0.2:
            color = COLOR_HEALTH_FG_WARN
        else:
            color = COLOR_HEALTH_FG_BAD
        pygame.draw.rect(self.screen, color, pygame.Rect(bar_x, bar_y, int(bar_w * ratio), bar_h))
        # Health text
        font = pygame.font.Font(None, 24)
        text = font.render(f"HP: {self.player.health}/{self.player.max_health}", True, (255, 255, 255))
        self.screen.blit(text, (bar_x, bar_y + bar_h + 4))
        # Room text
        rtext = font.render(f"Room {self.current_room_index + 1} / {ROOM_COUNT}", True, (255, 255, 255))
        self.screen.blit(rtext, (bar_x, bar_y + bar_h + 28))

    def draw_message(self, text: str) -> None:
        """
        Render a centred message on the screen.  Supports multi‑line messages by
        splitting on newline characters and drawing each line beneath the last.
        """
        font = pygame.font.Font(None, 48)
        lines = text.split("\n")
        total_height = len(lines) * font.get_height() + (len(lines) - 1) * 8
        start_y = (SCREEN_HEIGHT - total_height) // 2
        for i, line in enumerate(lines):
            render = font.render(line, True, (255, 204, 0))
            rect = render.get_rect(center=(SCREEN_WIDTH // 2, start_y + i * (font.get_height() + 8)))
            self.screen.blit(render, rect)

    def display_game_over_message(self, victory: bool) -> None:
        """
        Compute elapsed time and display a detailed end‑of‑game message.  If the
        player is victorious, congratulate them; otherwise indicate their demise.
        """
        elapsed_ms = pygame.time.get_ticks() - self.start_time
        total_seconds = elapsed_ms // 1000
        minutes, seconds = divmod(total_seconds, 60)
        time_str = f"{minutes}:{seconds:02d}"
        if victory:
            title = "You have conquered the dungeon!"
        else:
            title = "You died!"
        message = f"{title}\nTime: {time_str}  Kills: {self.kills}"
        # Show for longer to allow players to read
        self.show_message(message, duration=6.0)

    # ------------------------------------------------------------------
    # High score and menu helpers
    def load_highscore(self) -> Dict[str, Optional[int]]:
        """
        Read the high score file from disk.  If the file does not exist or is
        malformed, return default values.  The returned dictionary has two
        keys: 'best_time' (milliseconds) and 'best_kills' (integer).
        """
        try:
            with open(HIGHSCORE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {
                        'best_time': data.get('best_time'),
                        'best_kills': data.get('best_kills'),
                    }
        except FileNotFoundError:
            pass
        except Exception:
            # ignore parse errors and fall through to default
            pass
        return {'best_time': None, 'best_kills': None}

    def save_highscore(self, elapsed_ms: int, kills: int) -> None:
        """
        Update the high score if the new time is faster or the kills count is
        higher.  Persist to disk.  The elapsed time is in milliseconds.
        """
        updated = False
        # Compare by time: lower is better.  Only consider victories (kills
        # greater than zero).  If no best_time recorded yet, any value qualifies.
        best_time = self.highscore.get('best_time')
        best_kills = self.highscore.get('best_kills')
        # Update time if this run is faster or if no time exists yet
        if kills > 0:
            if best_time is None or elapsed_ms < best_time:
                self.highscore['best_time'] = elapsed_ms
                updated = True
        # Update kills if this run achieves more kills (regardless of victory)
        if best_kills is None or kills > best_kills:
            self.highscore['best_kills'] = kills
            updated = True
        # Write out if there was an update
        if updated:
            try:
                with open(HIGHSCORE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(self.highscore, f)
            except Exception:
                # If writing fails, ignore errors but keep highscore in memory
                pass

    def reset_game(self) -> None:
        """
        Reset all game state for a new run.  This method is called when
        starting a game from the menu or after a game over when the player
        chooses to play again.
        """
        # Create a fresh dungeon and reset the current room
        self.dungeon = Dungeon(ROOM_COUNT)
        self.current_room_index = 0
        # Create a new player in the centre of the screen
        self.player = Player(SCREEN_WIDTH / 2 - 16, SCREEN_HEIGHT / 2 - 24, self.player_frames)
        # Reset room entities lists
        self.enemies = []
        self.potions = []
        self.upgrades = []
        # UI state
        self.message = None
        self.message_timer = 0.0
        self.game_over = False
        # Score tracking
        self.start_time = pygame.time.get_ticks()
        self.kills = 0
        # Load the first room's contents
        self.load_room(0)
        # Mark that we haven't saved the score for this run yet
        self.saved_score = False
        # Reset bombs
        self.bombs: List[Bomb] = []

    def draw_menu(self) -> None:
        """Render the start menu with title and high score information."""
        self.screen.fill(COLOR_BG)
        title_font = pygame.font.Font(None, 64)
        text_font = pygame.font.Font(None, 32)
        # Title
        title_surface = title_font.render("Rogue‑Lite POC", True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 3))
        self.screen.blit(title_surface, title_rect)
        # Instructions
        instr_surface = text_font.render("Press Enter to start", True, (200, 200, 200))
        instr_rect = instr_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
        self.screen.blit(instr_surface, instr_rect)
        # High score display
        best_time = self.highscore.get('best_time')
        best_kills = self.highscore.get('best_kills')
        # Format time as mm:ss
        if best_time is not None:
            total_seconds = best_time // 1000
            minutes, seconds = divmod(total_seconds, 60)
            time_str = f"{minutes}:{seconds:02d}"
        else:
            time_str = "--:--"
        kills_str = str(best_kills) if best_kills is not None else "--"
        hs_text = f"Best Time: {time_str}   Best Kills: {kills_str}"
        hs_surface = text_font.render(hs_text, True, (180, 180, 180))
        hs_rect = hs_surface.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2 + 40))
        self.screen.blit(hs_surface, hs_rect)
        pygame.display.flip()


if __name__ == '__main__':
    Game().run()