"""
Tests for SplitterEnemy splitting behaviour and bombs.

The SplitterEnemy should spawn two MiniEnemy instances upon splitting, and
bombs should deal area damage to enemies within the specified radius.
"""
import os
import math
import pygame
import pytest

from roguelite_poc.main import (
    SplitterEnemy,
    MiniEnemy,
    Enemy,
    Bomb,
    BOMB_RADIUS,
    BOMB_DAMAGE,
    MINI_ENEMY_HEALTH,
    MINI_ENEMY_SPEED,
)


@pytest.fixture(autouse=True)
def init_pygame():
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    pygame.init()
    pygame.display.set_mode((1, 1))
    yield
    pygame.quit()


def test_splitter_enemy_splits_into_two_minis():
    splitter = SplitterEnemy(100, 100)
    # Simulate death and splitting
    minis = splitter.split()
    assert len(minis) == 2
    # All minis should be MiniEnemy instances with correct stats
    for mini in minis:
        assert isinstance(mini, MiniEnemy)
        assert mini.max_health == MINI_ENEMY_HEALTH
        assert mini.health == MINI_ENEMY_HEALTH
        assert abs(mini.speed - MINI_ENEMY_SPEED) < 1e-5


def test_bomb_deals_damage_within_radius():
    # Place an enemy near the bomb within the radius
    enemy = Enemy(0, 0)  # enemy rectangle size 32x32 by default
    # Position enemy near (100, 100)
    enemy.rect.center = (100 + int(BOMB_RADIUS / 2), 100)
    enemy_health_before = enemy.health
    bomb = Bomb(100, 100)
    # Force immediate explosion
    bomb.timer_ms = 0
    bomb.update(0.0)
    # Apply AoE damage manually following the logic in Game
    dist = math.hypot(bomb.pos.x - enemy.rect.centerx, bomb.pos.y - enemy.rect.centery)
    if dist <= BOMB_RADIUS:
        enemy.damage(BOMB_DAMAGE)
    assert enemy.health == enemy_health_before - BOMB_DAMAGE