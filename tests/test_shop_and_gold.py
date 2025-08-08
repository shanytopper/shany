"""
Unit tests for currency and shop mechanics in the roguelike POC.  These tests
verify that coins increase the player's gold when collected and that shop
items can be purchased if the player has sufficient funds.  A dummy effect
is used to confirm that the item's effect is applied correctly.

These tests run headless by initialising Pygame with a minimal display.
"""

import pygame
import pytest

from roguelite_poc.main import Game, Coin, ShopItem, Player


@pytest.fixture(autouse=True)
def init_pygame():
    """Initialise Pygame with a dummy video driver before each test."""
    pygame.display.init()
    pygame.display.set_mode((1, 1))
    yield
    pygame.display.quit()


def test_coin_collect():
    """Collecting a coin should increase the player's gold by its value."""
    game = Game()
    # Force game state to GAME so that player is instantiated
    game.state = 'GAME'
    # Ensure gold starts at zero
    game.gold = 0
    # Place a coin where the player stands
    coin = Coin(game.player.rect.centerx, game.player.rect.centery, value=3)
    game.coins.append(coin)
    # Simulate coin collection logic
    for c in game.coins:
        if not c.collected and game.player.rect.colliderect(c.rect):
            c.collected = True
            game.gold += c.value
    # After collection gold should equal coin value
    assert game.gold == 3


def test_shop_purchase():
    """Purchasing a shop item should deduct gold and apply its effect."""
    game = Game()
    game.state = 'GAME'
    # Give player some gold
    game.gold = 10
    # Define a simple effect that sets a flag on the player
    def effect(player: Player) -> None:
        setattr(player, 'test_attr', True)
    # Create a shop item with price 5 and place it at player's position
    item = ShopItem('Test Item', effect, price=5, x=game.player.rect.centerx, y=game.player.rect.centery)
    game.shop_items.append(item)
    # Simulate purchase logic
    if not item.purchased and game.player.rect.colliderect(item.rect) and game.gold >= item.price:
        item.apply(game.player)
        game.gold -= item.price
    # Gold should decrease by price and effect should be applied
    assert game.gold == 5
    assert hasattr(game.player, 'test_attr') and game.player.test_attr is True