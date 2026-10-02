"""Shared pytest setup.

Hypothesis profiles: the default runs 300 examples per property (a few seconds);
`HYPOTHESIS_PROFILE=deep uv run pytest tests/test_properties.py` runs 5000.
"""

import os

import pytest
from hypothesis import settings

from satchel.db.connection import open_db
from tests.fixtures.demo import build_demo

settings.register_profile("default", max_examples=300, deadline=None)
settings.register_profile("deep", max_examples=5000, deadline=None)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "default"))


@pytest.fixture(scope="session")
def demo_path(tmp_path_factory):
    """The demo character, built once per test run through the real save path."""
    return build_demo(tmp_path_factory.mktemp("demo") / "wren.satchel")


@pytest.fixture
def demo(demo_path):
    """A connection to the demo file. Tests must not write to it (it's shared)."""
    conn = open_db(demo_path)
    yield conn
    conn.close()
