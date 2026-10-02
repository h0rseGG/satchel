import satchel


def test_package_imports():
    assert satchel.__version__.startswith("3.")
