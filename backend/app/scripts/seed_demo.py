from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import SessionLocal  # noqa: E402
from app.services.demo_seed_service import seed_demo_workspace  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed isolated synthetic demo workspaces for BizPilot AI (never alters non-demo records)."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing is_demo_data=True businesses before re-seeding.",
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        result = seed_demo_workspace(db, reset_existing=args.reset)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
