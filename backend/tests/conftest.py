"""Fixtures partilhadas.

Os testes marcados com `db` precisam de um PostgreSQL de teste (TEST_DATABASE_URL).
Se não estiver disponível são saltados; no CI corre um serviço postgres:17.
"""

from __future__ import annotations

import os

import psycopg
import pytest

from skytracer.db.migrate import migrate

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://skytracer:skytracer@localhost:5433/skytracer_test"
)
TABLES = "position, receiver_snapshot, aircraft_live, flight_route, aircraft"


@pytest.fixture(scope="session")
def db_url() -> str:
    try:
        with psycopg.connect(TEST_DATABASE_URL, autocommit=True, connect_timeout=2) as conn:
            conn.execute("DROP SCHEMA public CASCADE")
            conn.execute("CREATE SCHEMA public")
    except psycopg.OperationalError:
        pytest.skip("PostgreSQL de teste indisponível (TEST_DATABASE_URL)")
    migrate(TEST_DATABASE_URL)
    return TEST_DATABASE_URL


@pytest.fixture
def conn(db_url: str):
    with psycopg.connect(db_url) as c:
        c.execute(f"TRUNCATE {TABLES}")
        c.commit()
        yield c
