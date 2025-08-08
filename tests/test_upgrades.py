"""
Tests for the upgrade system.  These ensure that applying upgrades
modifies player attributes as expected.  The tests run with the
SDL dummy video driver so that no window is opened.
"""
import os
import pygame
import pytest

from roguelite_poc.main import Player, Upgrade, UPGRADE_TYPES, UP, DOWN, LEFT, RIGHT


@pytest.fixture(autouse=True)
def init_pygame():
    # Use the dummy video driver to allow pygame to operate without a display
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.init()
    pygame.display.set_mode((1, 1))
    yield
    pygame.quit()


def dummy_frames() -> dict:
    """Return a minimal frames dict for Player instantiation."""
    surf = pygame.Surface((1, 1))
    return {UP: [surf], DOWN: [surf], LEFT: [surf], RIGHT: [surf]}


def test_power_up_increases_damage():
    player = Player(0, 0, dummy_frames())
    initial_damage = player.bullet_damage
    upgrade = Upgrade('Power Up', UPGRADE_TYPES['Power Up'], 0, 0)
    upgrade.apply(player)
    assert player.bullet_damage == initial_damage + 5


def test_rapid_fire_decreases_cooldown():
    player = Player(0, 0, dummy_frames())
    initial_rate = player.fire_rate_ms
    upgrade = Upgrade('Rapid Fire', UPGRADE_TYPES['Rapid Fire'], 0, 0)
    upgrade.apply(player)
    # Fire rate should decrease by 50ms but not below 50ms
    assert player.fire_rate_ms == max(50, initial_rate - 50)


def test_fleet_feet_increases_speed():
    player = Player(0, 0, dummy_frames())
    initial_speed = player.speed
    upgrade = Upgrade('Fleet Feet', UPGRADE_TYPES['Fleet Feet'], 0, 0)
    upgrade.apply(player)
    assert player.speed == initial_speed + 40


def test_vitality_increases_max_health_and_heals():
    player = Player(0, 0, dummy_frames())
    player.health = player.max_health - 10
    initial_max = player.max_health
    upgrade = Upgrade('Vitality', UPGRADE_TYPES['Vitality'], 0, 0)
    upgrade.apply(player)
    # max health increased by 20
    assert player.max_health == initial_max + 20
    # health increased by 20 but not above new max
    assert player.health == min(player.max_health, (initial_max - 10) + 20)