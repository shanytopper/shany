"""
Tests for the spread shot and shield upgrades and the turret enemy.

These tests validate that applying the Spread Shot and Shield upgrades
modifies the player's attributes correctly and that a turret fires bullets
in eight evenly spaced directions.  Running ``pytest`` in the project root
will discover and run these tests.  A dummy SDL video driver is used so
that Pygame functions can run without opening a window.
"""
import os
import math
import pygame
import pytest

from roguelite_poc.main import (
    Player,
    Upgrade,
    UPGRADE_TYPES,
    TurretEnemy,
    BULLET_SPEED,
    UP,
    DOWN,
    LEFT,
    RIGHT,
)


@pytest.fixture(autouse=True)
def init_pygame():
    """Initialise Pygame with a dummy video driver for headless testing."""
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.init()
    pygame.display.set_mode((1, 1))
    yield
    pygame.quit()


def dummy_frames():
    """Return a minimal frames dict for instantiating a Player."""
    surf = pygame.Surface((1, 1))
    return {UP: [surf], DOWN: [surf], LEFT: [surf], RIGHT: [surf]}


def test_spread_shot_upgrade_increases_bullet_count():
    player = Player(0, 0, dummy_frames())
    # initial bullet count should be 1
    assert player.bullet_count == 1
    # Apply Spread Shot once (adds 2)
    upgrade = Upgrade('Spread Shot', UPGRADE_TYPES['Spread Shot'], 0, 0)
    upgrade.apply(player)
    assert player.bullet_count == 3
    # Apply Spread Shot again (should cap at 5)
    upgrade2 = Upgrade('Spread Shot', UPGRADE_TYPES['Spread Shot'], 0, 0)
    upgrade2.apply(player)
    assert player.bullet_count == 5


def test_shield_upgrade_increases_shield_points():
    player = Player(0, 0, dummy_frames())
    assert player.shield == 0
    upgrade = Upgrade('Shield', UPGRADE_TYPES['Shield'], 0, 0)
    upgrade.apply(player)
    assert player.shield == 1
    # Applying again should increment again
    upgrade2 = Upgrade('Shield', UPGRADE_TYPES['Shield'], 0, 0)
    upgrade2.apply(player)
    assert player.shield == 2


def test_turret_enemy_fires_eight_bullets_in_different_directions():
    # Create a turret and force it to fire by manipulating its cooldown
    turret = TurretEnemy(100, 100)
    # Set last_shot_time far enough in the past to trigger firing on update
    turret.last_shot_time = pygame.time.get_ticks() - turret.cooldown_ms - 1
    # Call update with dt=0 so that bullets spawn immediately
    turret.update(0.0, None)  # player argument unused for TurretEnemy
    # There should be exactly 8 bullets
    assert len(turret.bullets) == 8
    # Collect the normalized directions of the bullets
    directions = set()
    for b in turret.bullets:
        # Normalise velocity to length 1 to compare direction
        length = math.hypot(b.vel.x, b.vel.y)
        # Ensure bullet speed matches expected (0.6 * BULLET_SPEED)
        assert abs(length - BULLET_SPEED * 0.6) < 1e-3
        # Quantise angle to multiples of 45 degrees
        angle = math.degrees(math.atan2(b.vel.y, b.vel.x))
        # Round to nearest 45 for set membership
        rounded = round(angle / 45.0) * 45
        directions.add(rounded % 360)
    # Turret should fire bullets in eight cardinal/intercardinal directions
    assert len(directions) == 8