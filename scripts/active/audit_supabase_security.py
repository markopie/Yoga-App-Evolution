"""
audit_supabase_security.py
==========================
Supabase security audit for Yoga App Evolution.

Checks:
  1. Anon-key INSERT into `asanas`  → should be blocked by RLS
  2. Anon-key SELECT from `asanas`  → report whether data leaks without auth
  3. Source-code scan of app.js / dataAdapter.js for hardcoded secrets

Usage:
  pip install supabase
  python scripts/audit_supabase_security.py
"""

import os
import re
import sys
import json

# ── Colour helpers (works on Windows 10+ terminals) ──────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✔  {msg}{RESET}")
def warn(msg): print(f"  {YELLOW}⚠  {msg}{RESET}")
def fail(msg): print(f"  {RED}✖  {msg}{RESET}")
def info(msg): print(f"  {CYAN}ℹ  {msg}{RESET}")
def section(title):
    print(f"\n{BOLD}{CYAN}{'─'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*60}{RESET}")


# ── Configuration ─────────────────────────────────────────────────────────────
SUPABASE_URL      = "https://qrcpiyncvfmpmeuyhsha.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY3BpeW5jdmZtcG1ldXloc2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTA2NDgsImV4cCI6MjA4NzI4NjY0OH0"
    ".7sjbfwdT_aYmrJyVFYWpfMNBQpCJAI7Vd5uNEkzD4GI"
)

# Files to scan for hardcoded secrets (relative to this script's parent dir)
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
FILES_TO_SCAN = [
    os.path.join(PROJECT_ROOT, "app.js"),
    os.path.join(PROJECT_ROOT, "src", "services", "dataAdapter.js"),
    os.path.join(PROJECT_ROOT, "src", "services", "supabaseClient.js"),
]

# Realistic dummy row using the actual asanas schema
# (id, name are real columns — this tests if the row gets inserted)
DUMMY_ROW = {
    "name": "__AUDIT_DELETE_ME__",
    "english_name": "__AUDIT_DELETE_ME__",
}

# ── 1. Supabase client checks ─────────────────────────────────────────────────
def check_supabase():
    try:
        from supabase import create_client, Client
    except ImportError:
        warn("supabase-py not installed — skipping live Supabase checks.")
        warn("Run:  pip install supabase")
        return

    section("SUPABASE LIVE CHECKS  (anon key only)")
    client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    # ── 1a. Anon INSERT ───────────────────────────────────────────────────────
    print(f"\n{BOLD}[1] Anon INSERT into `asanas`{RESET}")
    try:
        res = client.table("asanas").insert(DUMMY_ROW).execute()

        if res.data:
            fail("INSERT SUCCEEDED — RLS is NOT enforced for anon inserts!")
            fail("Table is PUBLICLY WRITABLE. Fix this before going to production.")
            # Clean up the dummy row
            inserted_id = res.data[0].get("id")
            if inserted_id:
                client.table("asanas").delete().eq("id", inserted_id).execute()
                info("Dummy row cleaned up.")
        else:
            ok("INSERT blocked (empty data returned). RLS appears active.")

    except Exception as e:
        err_str = str(e).lower()
        code = ""
        # supabase-py wraps PostgREST errors as dicts
        if isinstance(e.args[0], dict):
            code = e.args[0].get("code", "")
            msg  = e.args[0].get("message", str(e))
        else:
            msg = str(e)

        if code == "42501" or "permission denied" in err_str or "new row violates row-level" in err_str:
            ok(f"INSERT blocked by RLS (42501 — permission denied). RLS is active. ✔")
        elif code == "PGRST204" or "schema cache" in err_str:
            # Server rejected at schema validation before even checking RLS.
            # This is ambiguous — could mean RLS is on OR table structure mismatch.
            warn(f"INSERT hit a schema error (PGRST204) before RLS was evaluated.")
            warn("This is INCONCLUSIVE for RLS. Verify in Supabase Dashboard → Authentication → Policies.")
            info(f"Error: {msg}")
        elif "null value" in err_str or "not-null" in err_str or "violates" in err_str:
            warn(f"INSERT reached the table (schema constraint, not RLS): {msg}")
            warn("RLS may NOT be blocking anon writes — verify manually in Dashboard.")
        else:
            info(f"INSERT raised unexpected error (code={code}): {msg}")

    # ── 1b. Anon SELECT ───────────────────────────────────────────────────────
    print(f"\n{BOLD}[2] Anon SELECT from `asanas` — columns: id, name{RESET}")
    try:
        # Use columns confirmed to exist in the schema
        res = client.table("asanas").select("id, name").limit(3).execute()

        if res.data and len(res.data) > 0:
            warn("SELECT returned rows without authentication.")
            warn("Asana data is publicly readable — check if this is intentional.")
            info(f"Sample rows: {json.dumps(res.data[:3], ensure_ascii=False)}")
        elif res.data is not None and len(res.data) == 0:
            ok("SELECT returned 0 rows — RLS is restricting anonymous reads.")
        else:
            ok("SELECT returned no data — RLS appears active for reads.")

    except Exception as e:
        err_str = str(e).lower()
        code = e.args[0].get("code", "") if isinstance(e.args[0], dict) else ""
        msg  = e.args[0].get("message", str(e)) if isinstance(e.args[0], dict) else str(e)
        if code == "42501" or "permission denied" in err_str:
            ok(f"SELECT blocked by RLS (42501). Anon reads are restricted. ✔")
        else:
            info(f"SELECT raised: {msg}")


# ── 2. Source-code secret scan ────────────────────────────────────────────────
# Patterns that should NEVER appear in client-side JS
SECRET_PATTERNS = [
    (r"service_role",          "Supabase service_role key reference"),
    (r"secret_[\w]{8,}",       "Generic secret string (secret_xxx...)"),
    (r"eyJ[A-Za-z0-9_-]{20,}", "JWT token — verify it's anon key only, not service_role"),
    (r"SUPABASE_SERVICE",      "Service key env var reference"),
    (r"sk-[A-Za-z0-9]{20,}",   "OpenAI / Stripe-style secret key"),
]

def scan_sources():
    section("SOURCE CODE SECRET SCAN")
    any_found = False

    for filepath in FILES_TO_SCAN:
        if not os.path.exists(filepath):
            warn(f"File not found, skipping: {filepath}")
            continue

        rel = os.path.relpath(filepath, PROJECT_ROOT)
        print(f"\n{BOLD}Scanning: {rel}{RESET}")

        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        file_clean = True
        for lineno, line in enumerate(lines, 1):
            for pattern, label in SECRET_PATTERNS:
                if re.search(pattern, line, re.IGNORECASE):
                    # Special case: the anon key is expected in supabaseClient.js
                    if "supabaseClient.js" in filepath and "service_role" not in line.lower():
                        continue  # Anon key in supabaseClient.js is expected
                    fail(f"Line {lineno}: [{label}]")
                    print(f"         {line.rstrip()}")
                    file_clean = False
                    any_found = True

        if file_clean:
            ok("No secrets detected.")

    if not any_found:
        print()
        ok("All scanned files are clean.")


# ── 3. Summary ────────────────────────────────────────────────────────────────
def summary():
    section("CHECKLIST SUMMARY")
    checklist = [
        ("RLS blocks anon INSERT",   "Verify above — ✔ if blocked, ✖ if succeeded"),
        ("Anon SELECT intentional?", "Asana data public read — confirm this is by design"),
        ("No service_role in JS",    "Confirmed by source scan above"),
        ("Anon key in client JS",    "OK — anon key is safe to expose publicly"),
        ("Auth required for writes", "All mutations should go through authenticated sessions"),
        ("Auth required for reads",  "Consider RLS SELECT policy if data should be private"),
    ]
    for item, note in checklist:
        print(f"  {'□':<3} {BOLD}{item:<34}{RESET}  {note}")
    print()
    info("Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security")
    info("Check Dashboard → Table Editor → your table → RLS tab for policy details.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n{BOLD}Yoga App Evolution — Supabase Security Audit{RESET}")
    print(f"Project: {PROJECT_ROOT}")
    print(f"Target:  {SUPABASE_URL}")

    check_supabase()
    scan_sources()
    summary()

    print(f"\n{BOLD}Audit complete.{RESET}\n")
