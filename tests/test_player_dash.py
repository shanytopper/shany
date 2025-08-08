"""
Tests for the player's dash mechanic.  Ensures that dashing sets
invulnerability and multiplies velocity for the duration, and that
invulnerability resets after the duration expires.
"""

import pygame
from roguelite_poc.main import Player, UP, DASH_DURATION_MS, DASH_COOLDOWN_MS, DASH_MULTIPLIER


def test_dash_invulnerability_and_speed():
    # initialize pygame in headless mode
    pygame.display.init()
    screen = pygame.display.set_mode((1, 1))
    # Create dummy frames for player animations
    dummy_surface = pygame.Surface((32, 64))
    frames = {UP: [dummy_surface]}
    p = Player(0, 0, frames)
    # simulate a dash start
    now = pygame.time.get_ticks()
    p.last_dash_time = now - DASH_COOLDOWN_MS
    # call handle_input with shift pressed
    keys = {k: False for k in range(512)}
    keys[pygame.K_LSHIFT] = True
    # convert to ScancodeWrapper like object by using pygame.key.ScancodeWrapper
    # But we can simulate by using the player's method expecting a ScancodeWrapper, which supports __getitem__
    class FakeKeys:
        def __init__(self, mapping):
            self.mapping = mapping
        def __getitem__(self, key):
            return self.mapping.get(key, False)

    p.handle_input(FakeKeys(keys), 0.016)
    # dash should be active
    assert p.dash_time_remaining > 0
    assert p.invulnerable
    # During dash, applying input should scale velocity
    keys = {k: False for k in range(512)}
    keys[pygame.K_w] = True
    pk = FakeKeys(keys)
    p.handle_input(pk, 0.016)
    # after normalization, speed should equal PLAYER_SPEED * DASH_MULTIPLIER
    assert abs(p.vel.length() - p.speed * DASH_MULTIPLIER) < 1e-3
    # Simulate dash end
    p.dash_time_remaining = -1
    p.update(0.016)
    assert not p.invulnerable
    pygame.display.quit()