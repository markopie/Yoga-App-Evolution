#!/usr/bin/env python3
"""
Process the course_analysis_refresh_queue.

Calls process_course_analysis_refresh_queue(limit_count := 50) repeatedly
until no rows remain, printing progress for each batch.

Usage:
    python scripts/process_course_analysis_queue.py

Requires:
    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
"""

import os
import sys
import time
from dotenv import load_dotenv
from supabase import create_client, Client

# ==========================================
# CONFIGURATION
# ==========================================
BATCH_SIZE = 50
SLEEP_SECONDS = 1  # brief pause between batches to avoid hammering the DB

load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    print("❌ Fatal: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

supabase: Client = create_client(URL, KEY)


def process_queue() -> None:
    """Repeatedly call process_course_analysis_refresh_queue until empty."""
    print("=" * 60)
    print("  Course Analysis Queue Processor")
    print("=" * 60)
    print()

    total_processed = 0
    batch_number = 0

    while True:
        batch_number += 1
        try:
            res = supabase.rpc(
                "process_course_analysis_refresh_queue",
                {"limit_count": BATCH_SIZE}
            ).execute()

            raw = res.data
            if raw is None:
                rows: list = []
            elif isinstance(raw, list):
                rows = raw
            else:
                rows = [raw]

            if not rows:
                print()
                print(f"✅ Queue empty. Processed {total_processed} course(s) total.")
                break

            batch_count = len(rows)
            total_processed += batch_count

            # Extract course IDs for display
            course_ids = []
            for row in rows:
                if isinstance(row, dict):
                    cid = row.get("course_id") or row.get("id")
                else:
                    cid = row
                if cid is not None:
                    course_ids.append(str(cid))

            ids_str = ", ".join(course_ids) if course_ids else "(unknown)"
            print(f"  Batch {batch_number}: {batch_count} course(s) refreshed  [{ids_str}]")

            if SLEEP_SECONDS > 0:
                time.sleep(SLEEP_SECONDS)

        except Exception as e:
            print()
            print(f"❌ Error processing batch {batch_number}: {e}")
            print(f"   Processed {total_processed} course(s) before error.")
            sys.exit(1)

    print()
    print("=" * 60)
    print(f"  Done. Total courses refreshed: {total_processed}")
    print("=" * 60)


if __name__ == "__main__":
    process_queue()
