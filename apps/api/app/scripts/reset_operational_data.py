"""One-off wipe of patient / financial / appointment operational data.

Usage (Railway):
  railway run --service dentist-on-call-api python -m app.scripts.reset_operational_data --confirm
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Wipe operational clinical/financial data.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required. Without this flag the script refuses to run.",
    )
    args = parser.parse_args()
    if not args.confirm:
        print("Refusing to run without --confirm", file=sys.stderr)
        return 2

    from app.database.session import SessionLocal
    from app.services.clinical_purge import purge_all_operational_data

    session = SessionLocal()
    try:
        stats = purge_all_operational_data(session)
        session.commit()
        print("Operational data wiped:", stats)
        return 0
    except Exception as exc:
        session.rollback()
        print(f"Wipe failed: {exc}", file=sys.stderr)
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
