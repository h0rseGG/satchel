"""CLAUDE.md rule: satchel.core is pure (no Qt, no sqlite, no file I/O)."""

import ast
from pathlib import Path

import pytest

CORE = Path(__file__).parent.parent / "src" / "satchel" / "core"
BANNED_MODULES = {"sqlite3", "PySide6", "os", "pathlib", "shutil", "io", "subprocess", "satchel.db"}
BANNED_CALLS = {"open"}


@pytest.mark.parametrize("path", sorted(CORE.glob("*.py")), ids=lambda p: p.name)
def test_core_module_is_pure(path):
    tree = ast.parse(path.read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            assert node.func.id not in BANNED_CALLS, f"{path.name}: calls {node.func.id}()"
            continue
        else:
            continue
        for name in names:
            root = name.split(".")[0]
            assert root not in BANNED_MODULES and name not in BANNED_MODULES, (
                f"{path.name} imports {name}"
            )
