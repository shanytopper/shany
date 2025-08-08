"""
Unit tests for the Dungeon and Room generation logic.

These tests validate that each generated dungeon is fully connected, i.e.
every room can be reached from the starting room by following neighbor
pointers.  A random generator is used so we test multiple instances in a
loop.  Running ``pytest`` in the project root will discover and run these
tests.
"""

import pytest
from roguelite_poc.main import Dungeon, ROOM_COUNT, UP, DOWN, LEFT, RIGHT


def reachable_rooms(dungeon: Dungeon) -> set:
    """Perform a breadth‑first search from room 0 and return a set of visited room indices."""
    visited = set()
    stack = [0]
    while stack:
        idx = stack.pop()
        if idx in visited:
            continue
        visited.add(idx)
        room = dungeon.get_room(idx)
        for neighbor in room.neighbors.values():
            if neighbor not in visited:
                stack.append(neighbor)
    return visited


def test_dungeon_connectivity():
    # Generate multiple dungeons to reduce risk of false positive
    for _ in range(5):
        d = Dungeon(ROOM_COUNT)
        reached = reachable_rooms(d)
        assert len(reached) == ROOM_COUNT, f"Dungeon not fully connected: reached {reached}"