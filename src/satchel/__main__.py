"""`uv run python -m satchel`: run with a console, so errors are visible while developing.
The installed `satchel` command is a windowed app with no console."""

import sys

from satchel.ui.app import main

sys.exit(main())
