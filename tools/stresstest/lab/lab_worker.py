"""Opt-in lab worker; the production environment and dependencies are untouched."""

import sys

sys.path.insert(0, "/results/scale-python")

from uvicorn.workers import UvicornWorker


class UVLoopWorker(UvicornWorker):
    CONFIG_KWARGS = {"loop": "uvloop", "http": "auto"}
