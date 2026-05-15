#!/usr/bin/env python3
"""
Startup migration helper.

Three cases handled:
  1. Fresh DB (no tables)       → create_all() from models, stamp head
  2. Pre-Alembic existing DB    → stamp 0001_baseline, upgrade head
  3. Alembic-tracked DB         → upgrade head (idempotent)
"""
import os
import subprocess

from sqlalchemy import create_engine
from sqlalchemy import inspect as sa_inspect

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
tables = set(sa_inspect(engine).get_table_names())


def run(*cmd: str) -> None:
    print(f"  $ {' '.join(cmd)}")
    subprocess.run(list(cmd), check=True)


if "transactions" not in tables:
    print("[migrate] Fresh database — creating schema from models")
    from database.base import Base  # noqa: E402 (import after env setup)
    Base.metadata.create_all(bind=engine)
    print("[migrate] Stamping Alembic at head")
    run("alembic", "stamp", "head")

elif "alembic_version" not in tables:
    print("[migrate] Existing pre-Alembic schema — stamping baseline then upgrading")
    run("alembic", "stamp", "0001_baseline")
    run("alembic", "upgrade", "head")

else:
    print("[migrate] Alembic-tracked DB — upgrading to head")
    run("alembic", "upgrade", "head")

print("[migrate] Database ready.")
