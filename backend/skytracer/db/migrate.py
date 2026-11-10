"""Runner de migrações SQL.

    python -m skytracer.db.migrate

Aplica por ordem os ficheiros `migrations/NNN_*.sql` ainda não registados em
`schema_migrations`, cada um na sua transação. É idempotente e seguro de correr no
arranque de todos os serviços (um advisory lock evita corridas entre eles).
"""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg

from skytracer.config import settings

log = logging.getLogger("skytracer.migrate")

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_ID = 7_353_201  # valor arbitrário, partilhado pelos serviços


def pending(applied: set[str]) -> list[Path]:
    return [p for p in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql")) if p.stem not in applied]


def migrate(dsn: str | None = None) -> list[str]:
    """Aplica as migrações em falta e devolve os nomes das que foram aplicadas."""
    done: list[str] = []
    with psycopg.connect(dsn or settings.database_url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            applied = {r[0] for r in conn.execute("SELECT name FROM schema_migrations")}
            for path in pending(applied):
                with conn.transaction():
                    conn.execute(path.read_text())
                    conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.stem,))
                log.info("Migração aplicada: %s", path.stem)
                done.append(path.stem)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
    return done


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    migrate()
