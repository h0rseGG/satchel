"""Shared pytest setup.

Hypothesis profiles: the default runs 300 examples per property (a few seconds);
`HYPOTHESIS_PROFILE=deep uv run pytest tests/test_properties.py` runs 5000.
"""

import os

from hypothesis import settings

settings.register_profile("default", max_examples=300, deadline=None)
settings.register_profile("deep", max_examples=5000, deadline=None)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "default"))
