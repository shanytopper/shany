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
        dirs = [UP, DOWN, LEFT, RIGHT]
        for i in range(len(self.rooms) - 1):
            # assign a connection between room i and i+1 via a random available direction
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
                # fallback to RIGHT/LEFT
                self.rooms[i].neighbors[RIGHT] = i + 1
                self.rooms[i + 1].neighbors[LEFT] = i

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
        self.speed = PLAYER_SPEED
        self.frames = frames  # map of direction to list of frames
        self.frame_index = 0
        self.animation_time = 0.0
        self.animation_rate = 0.12  # seconds per frame
        self.direction: int = DOWN
        self.last_direction: int = DOWN
        self.last_shot_time: float = 0.0
        self.bullets: List[Bullet] = []

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
            if now - self.last_shot_time >= BULLET_RATE_MS:
                self.last_shot_time = now
                direction = self.last_direction
                self.shoot(direction)

    def shoot(self, direction: int) -> None:
        # Start bullet at centre of player
        cx = self.rect.centerx
        cy = self.rect.centery
        vx, vy = 0.0, 0.0
        if direction == UP:
            vy = -BULLET_SPEED
        elif direction == DOWN:
            vy = BULLET_SPEED
        elif direction == LEFT:
            vx = -BULLET_SPEED
        elif direction == RIGHT:
            vx = BULLET_SPEED
        bullet = Bullet(cx, cy, vx, vy)
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


class Potion:
    """Collectible potion that heals the player."""
    def __init__(self, x: float, y: float) -> None:
        self.rect = pygame.Rect(x, y, 16, 16)
        self.collected = False

    def draw(self, surface: pygame.Surface) -> None:
        if not self.collected:
            pygame.draw.rect(surface, COLOR_POTION, self.rect)


class Game:
    """High level orchestrator: runs the loop and manages rooms and entities."""
    def __init__(self) -> None:
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("Rogue‑Lite POC")
        self.clock = pygame.time.Clock()
        # Load hero sprite sheet and slice into frames
        self.player_frames = self.load_hero_frames(os.path.join(os.path.dirname(__file__), 'hero.png'))
        # Create dungeon
        self.dungeon = Dungeon(ROOM_COUNT)
        self.current_room_index = 0
        # Create player at centre
        self.player = Player(SCREEN_WIDTH / 2 - 16, SCREEN_HEIGHT / 2 - 24, self.player_frames)
        # Entities for current room
        self.enemies: List[Enemy] = []
        self.potions: List[Potion] = []
        # UI state
        self.message: Optional[str] = None
        self.message_timer: float = 0.0
        self.game_over: bool = False
        # Initialize first room
        self.load_room(0)

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
        # Spawn enemies
        for _ in range(room.enemy_count):
            x = rand_int(60, SCREEN_WIDTH - 60)
            y = rand_int(60, SCREEN_HEIGHT - 60)
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
        # Main game loop
        while True:
            dt = self.clock.tick(60) / 1000.0  # delta time in seconds
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
            keys = pygame.key.get_pressed()
            if not self.game_over:
                # Update player
                self.player.handle_input(keys, dt)
                self.player.update(dt)
                # Update enemies
                for enemy in self.enemies:
                    enemy.update(dt, self.player)
                # Bullet vs enemy collisions
                for bullet in self.player.bullets:
                    for enemy in self.enemies:
                        if enemy.alive and bullet.alive and enemy.rect.collidepoint(bullet.pos):
                            enemy.damage(bullet.damage)
                            bullet.alive = False
                # Enemy vs player collisions
                for enemy in self.enemies:
                    if enemy.alive and self.player.rect.colliderect(enemy.rect):
                        # damage player and knock enemy slightly
                        self.player.damage(10)
                        # simple knockback: push enemy away from player
                        dx = enemy.rect.centerx - self.player.rect.centerx
                        dy = enemy.rect.centery - self.player.rect.centery
                        dist = max(math.hypot(dx, dy), 0.1)
                        enemy.rect.x += int((dx / dist) * 20)
                        enemy.rect.y += int((dy / dist) * 20)
                # Potion pickup
                for potion in self.potions:
                    if not potion.collected and self.player.rect.colliderect(potion.rect):
                        potion.collected = True
                        self.player.heal(POTION_HEAL)
                # Remove dead enemies
                enemies_before = len(self.enemies)
                self.enemies = [e for e in self.enemies if e.alive]
                # Check room cleared
                if enemies_before > 0 and not self.enemies and not self.dungeon.get_room(self.current_room_index).cleared:
                    self.dungeon.get_room(self.current_room_index).cleared = True
                    self.show_message("Room cleared!")
                # Update message timer
                if self.message:
                    self.message_timer -= dt
                    if self.message_timer <= 0:
                        self.message = None
                # Room transitions (doors).  Only allow when room cleared.
                room = self.dungeon.get_room(self.current_room_index)
                if room.cleared:
                    # Top door
                    if self.player.rect.top <= 0 and UP in room.neighbors:
                        self.player.rect.top = SCREEN_HEIGHT - self.player.rect.height - 2
                        self.load_room(room.neighbors[UP])
                    # Bottom door
                    elif self.player.rect.bottom >= SCREEN_HEIGHT - 1 and DOWN in room.neighbors:
                        self.player.rect.bottom = self.player.rect.height + 2
                        self.load_room(room.neighbors[DOWN])
                    # Left door
                    elif self.player.rect.left <= 0 and LEFT in room.neighbors:
                        self.player.rect.left = SCREEN_WIDTH - self.player.rect.width - 2
                        self.load_room(room.neighbors[LEFT])
                    # Right door
                    elif self.player.rect.right >= SCREEN_WIDTH - 1 and RIGHT in room.neighbors:
                        self.player.rect.right = self.player.rect.width + 2
                        self.load_room(room.neighbors[RIGHT])
                # Check victory
                if all(r.cleared for r in self.dungeon.rooms) and not self.game_over:
                    self.game_over = True
                    self.show_message("You have conquered the dungeon!", duration=4.0)
                # Check player death
                if self.player.health <= 0 and not self.game_over:
                    self.game_over = True
                    self.show_message("You died!", duration=4.0)
            # Draw
            self.screen.fill(COLOR_BG)
            # Draw walls (simple rectangle around edges)
            pygame.draw.rect(self.screen, COLOR_WALL, pygame.Rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT), 4)
            # Draw doors as gaps when room cleared
            room = self.dungeon.get_room(self.current_room_index)
            if room.cleared:
                door_width = 60
                door_thickness = 4
                # Up
                if UP in room.neighbors:
                    pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, 0, door_width, door_thickness))
                # Down
                if DOWN in room.neighbors:
                    pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect((SCREEN_WIDTH - door_width) // 2, SCREEN_HEIGHT - door_thickness, door_width, door_thickness))
                # Left
                if LEFT in room.neighbors:
                    pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(0, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
                # Right
                if RIGHT in room.neighbors:
                    pygame.draw.rect(self.screen, COLOR_BG, pygame.Rect(SCREEN_WIDTH - door_thickness, (SCREEN_HEIGHT - door_width) // 2, door_thickness, door_width))
            # Draw potions
            for potion in self.potions:
                potion.draw(self.screen)
            # Draw entities
            for enemy in self.enemies:
                enemy.draw(self.screen)
            self.player.draw(self.screen)
            # Draw UI (health bar and room info)
            self.draw_ui()
            # Draw message
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
        font = pygame.font.Font(None, 48)
        render = font.render(text, True, (255, 204, 0))
        rect = render.get_rect(center=(SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2))
        self.screen.blit(render, rect)


if __name__ == '__main__':
    Game().run()