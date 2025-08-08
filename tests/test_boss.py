"""
Tests for the BossEnemy.  Verify radial attack properties.
"""
import os
import math
import pygame
import pytest

from roguelite_poc.main import BossEnemy, BOSS_BULLET_COUNT, BOSS_BULLET_SPEED


@pytest.fixture(autouse=True)
def init_pygame():
    # Use dummy video driver for headless testing
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.init()
    pygame.display.set_mode((1, 1))
    yield
    pygame.quit()


def test_radial_attack_spawns_correct_bullets():
    boss = BossEnemy(100, 100)
    assert len(boss.bullets) == 0
    boss.perform_radial_attack()
    assert len(boss.bullets) == BOSS_BULLET_COUNT
    # All bullets should have velocity magnitude equal to BOSS_BULLET_SPEED
    for bullet in boss.bullets:
        speed = math.hypot(bullet.vel.x, bullet.vel.y)
        assert abs(speed - BOSS_BULLET_SPEED) < 1e-5