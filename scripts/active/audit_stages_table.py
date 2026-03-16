"""
audit_stages_table.py
=====================
Comprehensive test suite for the `stages` table in the Yoga App Evolution
Supabase database.

Test Suites
-----------
  1. SECURITY       — Anon INSERT into `stages` must be blocked by RLS
  2. RELATIONAL     — JOIN query: pick a random asana_id, confirm matching stages exist
  3. DATA QUALITY   — stage_name contains Roman Numerals stored as strings, not integers
  4. ORPHAN REPORT  — Flag any stage rows whose asana_id has no matching row in `asanas`

Usage
-----
  # From the project root:
  python scripts/audit_stages_table.py

Requirements
------------
  pip install supabase python-dotenv
"""

import os
import re
import sys
import json
import random

# ── Colour helpers (Windows 10+ / ANSI terminals) ─────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def ok(msg):    print(f"  {GREEN}✔  {msg}{RESET}")
def warn(msg):  print(f"  {YELLOW}⚠  {msg}{RESET}")
def fail(msg):  print(f"  {RED}✖  {msg}{RESET}")
def info(msg):  print(f"  {CYAN}ℹ  {msg}{RESET}")
def dim(msg):   print(f"  {DIM}{msg}{RESET}")

def section(title):
    bar = "─" * 62
    print(f"\n{BOLD}{CYAN}{bar}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{bar}{RESET}")


# ── Configuration ──────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Try loading .env via python-dotenv (optional but convenient)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_ROOT, ".env"))
except ImportError:
    pass  # Fall back to inline keys below

SUPABASE_URL      = os.getenv("SUPABASE_URL",      "https://qrcpiyncvfmpmeuyhsha.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyY3BpeW5jdmZtcG1ldXloc2hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MTA2NDgsImV4cCI6MjA4NzI4NjY0OH0"
    ".7sjbfwdT_aYmrJyVFYWpfMNBQpCJAI7Vd5uNEkzD4GI"
))

# Roman numeral detection.
# Strict full-match: requires at least one non-empty Roman token so that an
# empty string or pure non-Roman string does NOT match.
# Handles: I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI … LXXXIX etc.
# Also handles trailing lowercase variant letters (IIa, IVb) via the caller's strip.
ROMAN_PATTERN = re.compile(
    r"^(?=[MDCLXVI])M*(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$",
    re.IGNORECASE
)

# A minimal dummy stage row for the INSERT probe.
# Uses a clearly sentinel asana_id that should never exist in production data.
DUMMY_STAGE_ROW = {
    "asana_id":   "__AUDIT_PROBE__",
    "stage_name": "__AUDIT_DELETE_ME__",
    "title":      "Security audit probe — delete if present",
}

# Counters for final summary  (Optional[bool]: True=pass, False=fail, None=inconclusive)
from typing import Dict, Optional
results: Dict[str, Optional[bool]] = {
    "security_pass":     None,
    "relational_pass":   None,
    "data_quality_pass": None,
    "orphan_pass":       None,
}


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 1 — SECURITY: Anon INSERT must be blocked
# ══════════════════════════════════════════════════════════════════════════════
def check_security(client):
    section("CHECK 1 · SECURITY  —  Anon INSERT into `stages`")

    print(f"\n{BOLD}Attempting INSERT with the anon key (should be blocked by RLS)…{RESET}")
    try:
        res = client.table("stages").insert(DUMMY_STAGE_ROW).execute()

        if res.data:
            fail("INSERT SUCCEEDED — RLS is NOT enforced for anonymous inserts!")
            fail("The `stages` table is PUBLICLY WRITABLE. Fix before production.")
            # Best-effort cleanup
            inserted_id = res.data[0].get("id")
            if inserted_id:
                client.table("stages").delete().eq("id", inserted_id).execute()
                info("Dummy row cleaned up from the database.")
            results["security_pass"] = False
        else:
            ok("INSERT returned empty data — RLS appears active.")
            results["security_pass"] = True

    except Exception as e:
        err_str = str(e).lower()
        code, msg = _parse_error(e)

        if code == "42501" or "permission denied" in err_str or "new row violates row-level" in err_str:
            ok(f"INSERT blocked by RLS (PostgreSQL 42501 — permission denied). RLS is active.")
            results["security_pass"] = True

        elif code == "PGRST301" or "jwt" in err_str or "authentication" in err_str:
            warn("INSERT rejected at the JWT / auth layer before RLS was evaluated.")
            info(f"Error code={code}: {msg}")
            results["security_pass"] = True  # Still effectively blocked

        elif code == "PGRST204" or "schema cache" in err_str:
            warn("INSERT hit a schema-cache error (PGRST204) before RLS was evaluated.")
            warn("INCONCLUSIVE — verify RLS manually in Supabase Dashboard → Table → Policies.")
            info(f"Error: {msg}")
            results["security_pass"] = None

        elif "null value" in err_str or "not-null" in err_str or "violates" in err_str:
            warn(f"INSERT reached the table but hit a NOT NULL constraint: {msg}")
            warn("RLS may NOT be blocking anon writes — verify in the Dashboard.")
            results["security_pass"] = False

        else:
            info(f"INSERT raised an unexpected error (code={code}): {msg}")
            results["security_pass"] = None


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 2 — RELATIONAL INTEGRITY: JOIN query on a random asana
# ══════════════════════════════════════════════════════════════════════════════
def check_relational_integrity(client):
    section("CHECK 2 · RELATIONAL INTEGRITY  —  JOIN on a random asana_id")

    # ── Step A: fetch a pool of asana IDs ─────────────────────────────────────
    print(f"\n{BOLD}Step A — Fetching a random sample of asana IDs…{RESET}")
    try:
        asana_res = client.table("asanas").select("id, name").limit(200).execute()
    except Exception as e:
        fail(f"Could not SELECT from `asanas`: {_parse_error(e)[1]}")
        results["relational_pass"] = False
        return

    if not asana_res.data:
        warn("No rows returned from `asanas` — cannot perform JOIN test.")
        results["relational_pass"] = None
        return

    # Pick a random asana
    chosen = random.choice(asana_res.data)
    chosen_id   = chosen["id"]
    chosen_name = chosen.get("name", "Unknown")
    info(f"Randomly selected asana: id={chosen_id!r}  name={chosen_name!r}")

    # ── Step B: query stages WHERE asana_id = chosen_id ───────────────────────
    print(f"\n{BOLD}Step B — Querying `stages` WHERE asana_id = {chosen_id!r}…{RESET}")
    try:
        stages_res = client.table("stages").select(
            "id, asana_id, stage_name, title"
        ).eq("asana_id", chosen_id).execute()
    except Exception as e:
        fail(f"Could not SELECT from `stages`: {_parse_error(e)[1]}")
        results["relational_pass"] = False
        return

    if stages_res.data:
        ok(f"Found {len(stages_res.data)} stage(s) linked to asana {chosen_id!r} ({chosen_name}).")
        print()
        _print_stages_table(stages_res.data)
        results["relational_pass"] = True
    else:
        warn(f"No stages found for asana_id={chosen_id!r} ({chosen_name}).")
        warn("This may be expected if this asana has no curriculum stages yet.")
        info("Try re-running the script — a different random asana will be selected each time.")
        results["relational_pass"] = None  # Inconclusive; not all asanas need stages

    # ── Step C: verify the Supabase FK relationship resolves correctly ─────────
    print(f"\n{BOLD}Step C — Verifying embedded JOIN via Supabase PostgREST…{RESET}")
    try:
        # This uses the implicit FK relationship stages.asana_id → asanas.id
        join_res = client.table("stages").select(
            "id, stage_name, asana_id, asanas(id, name)"
        ).eq("asana_id", chosen_id).limit(3).execute()

        if join_res.data:
            ok("PostgREST embedded JOIN resolved successfully.")
            for row in join_res.data:
                parent = row.get("asanas") or {}
                dim(f"  stage_name={row.get('stage_name')!r:<8}  "
                    f"→  parent asana name={parent.get('name', 'N/A')!r}")
        else:
            warn("Embedded JOIN returned no data for this asana_id.")
    except Exception as e:
        code, msg = _parse_error(e)
        warn(f"Embedded PostgREST JOIN raised an error (code={code}): {msg}")
        info("This may indicate the FK relationship is not named as expected.")


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 3 — DATA CONSISTENCY: stage_name type & Roman numeral content
# ══════════════════════════════════════════════════════════════════════════════
def check_data_consistency(client):
    section("CHECK 3 · DATA CONSISTENCY  —  stage_name type & Roman numerals")

    print(f"\n{BOLD}Fetching all distinct stage_name values…{RESET}")
    try:
        res = client.table("stages").select("stage_name").execute()
    except Exception as e:
        fail(f"Could not SELECT stage_name from `stages`: {_parse_error(e)[1]}")
        results["data_quality_pass"] = False
        return

    if not res.data:
        warn("No rows in `stages` — nothing to analyse.")
        results["data_quality_pass"] = None
        return

    # Collect unique stage_name values preserving order of first occurrence
    seen = {}
    for row in res.data:
        sn = row.get("stage_name")
        seen[sn] = seen.get(sn, 0) + 1

    total_rows      = len(res.data)
    unique_names    = list(seen.keys())

    print(f"\n  Total rows in `stages`: {BOLD}{total_rows}{RESET}")
    print(f"  Unique stage_name values ({len(unique_names)} distinct):\n")

    # ── Type check ─────────────────────────────────────────────────────────────
    type_failures   = []
    roman_names     = []
    non_roman_names = []
    integer_names   = []

    for name in unique_names:
        # Type check: must be a Python str, never an int
        if isinstance(name, int):
            type_failures.append(name)
            integer_names.append(name)
        elif not isinstance(name, str):
            type_failures.append(name)
        else:
            # Roman numeral presence check.
            # Strip ONLY strictly-lowercase trailing variant letters
            # (e.g. "IIa" → "II", "IVb" → "IV") so that uppercase
            # Roman digits like the final 'I' in "VIII" are NOT consumed.
            stripped = re.sub(r"[a-z]+$", "", name or "")  # NO re.IGNORECASE
            if stripped and ROMAN_PATTERN.match(stripped):
                roman_names.append(name)
            else:
                non_roman_names.append(name)

    # ── Print summary table ────────────────────────────────────────────────────
    _print_name_analysis_table(seen, roman_names, non_roman_names, type_failures)

    # ── Verdicts ───────────────────────────────────────────────────────────────
    print()
    if type_failures:
        fail(f"TYPE VIOLATION: {len(type_failures)} stage_name value(s) are NOT strings!")
        for v in type_failures:
            fail(f"  Offending value: {v!r}  (Python type: {type(v).__name__})")
        results["data_quality_pass"] = False
    else:
        ok("All stage_name values are Python strings. No integer type leakage detected.")

    if roman_names:
        ok(f"{len(roman_names)} stage_name(s) contain valid Roman numeral prefixes "
           f"(e.g. {roman_names[:5]}).")
    else:
        warn("No Roman-numeral stage_names detected. Check if data has been loaded correctly.")

    if non_roman_names:
        non_null = [n for n in non_roman_names if n is not None]
        if non_null:
            info(f"{len(non_null)} stage_name(s) do NOT start with a Roman numeral "
                 f"(e.g. 'Modified I', 'TestStage'). These may be valid custom stages.")
            for n in non_null[:10]:
                dim(f"    {n!r}  (count: {seen[n]})")
            if len(non_null) > 10:
                dim(f"    … and {len(non_null) - 10} more")

    results["data_quality_pass"] = (not type_failures)


# ══════════════════════════════════════════════════════════════════════════════
# CHECK 4 — ORPHAN REPORT: stages without a valid asana_id parent
# ══════════════════════════════════════════════════════════════════════════════
def check_orphans(client):
    section("CHECK 4 · ORPHAN REPORT  —  stages without a valid asana parent")

    # ── Fetch all stages ───────────────────────────────────────────────────────
    print(f"\n{BOLD}Fetching all stages…{RESET}")
    try:
        stages_res = client.table("stages").select("id, asana_id, stage_name, title").execute()
    except Exception as e:
        fail(f"Could not SELECT from `stages`: {_parse_error(e)[1]}")
        results["orphan_pass"] = False
        return

    if not stages_res.data:
        warn("No rows in `stages` — orphan check not applicable.")
        results["orphan_pass"] = None
        return

    # ── Fetch all valid asana IDs ──────────────────────────────────────────────
    print(f"{BOLD}Fetching all asana IDs…{RESET}")
    try:
        asana_res = client.table("asanas").select("id").execute()
    except Exception as e:
        fail(f"Could not SELECT from `asanas`: {_parse_error(e)[1]}")
        results["orphan_pass"] = False
        return

    valid_asana_ids = {row["id"] for row in (asana_res.data or [])}
    info(f"Known valid asana IDs: {len(valid_asana_ids)}")
    info(f"Total stages rows to inspect: {len(stages_res.data)}")

    # ── Identify orphans ───────────────────────────────────────────────────────
    orphans     = []
    null_parent = []

    for row in stages_res.data:
        aid = row.get("asana_id")
        if aid is None:
            null_parent.append(row)
        elif aid not in valid_asana_ids:
            orphans.append(row)

    # ── Report ─────────────────────────────────────────────────────────────────
    print()
    if null_parent:
        fail(f"NULL PARENT: {len(null_parent)} stage(s) have asana_id = NULL (no parent at all).")
        for row in null_parent[:10]:
            fail(f"  🚩 ORPHANED DATA  id={str(row.get('id'))[:8]}…  "
                 f"stage_name={row.get('stage_name')!r}  title={row.get('title')!r}")
        if len(null_parent) > 10:
            warn(f"  … and {len(null_parent) - 10} more NULL-parent stages.")
    else:
        ok("No stages have a NULL asana_id.")

    if orphans:
        fail(f"DANGLING FK: {len(orphans)} stage(s) reference an asana_id that does NOT exist in `asanas`.")
        print()
        print(f"  {'STAGE UUID (partial)':<22}  {'ASANA_ID':<12}  {'STAGE_NAME':<12}  TITLE")
        print(f"  {'─'*22}  {'─'*12}  {'─'*12}  {'─'*30}")
        for row in orphans:
            uid   = str(row.get("id", ""))[:18] + "…"
            aid   = str(row.get("asana_id", "N/A"))
            sname = str(row.get("stage_name", ""))[:12]
            title = str(row.get("title", ""))[:35]
            print(f"  {RED}🚩 ORPHANED DATA{RESET}  "
                  f"{uid:<22}  {aid:<12}  {sname:<12}  {title}")
        print()
        results["orphan_pass"] = False
    elif null_parent:
        results["orphan_pass"] = False
    else:
        ok(f"All {len(stages_res.data)} stage rows have a valid asana_id parent. ✔")
        results["orphan_pass"] = True


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
def print_summary():
    section("SUMMARY")

    _status = {
        True:  f"{GREEN}PASS{RESET}",
        False: f"{RED}FAIL{RESET}",
        None:  f"{YELLOW}INCONCLUSIVE{RESET}",
    }

    rows = [
        ("Security (anon INSERT blocked)",  results["security_pass"]),
        ("Relational integrity (JOIN)",     results["relational_pass"]),
        ("Data quality (stage_name types)", results["data_quality_pass"]),
        ("No orphaned stage records",       results["orphan_pass"]),
    ]

    print()
    print(f"  {'CHECK':<42}  STATUS")
    print(f"  {'─'*42}  {'─'*14}")
    for label, status in rows:
        print(f"  {label:<42}  {_status[status]}")

    fails = [r for _, r in rows if r is False]
    incon = [r for _, r in rows if r is None]
    print()
    if fails:
        fail(f"{len(fails)} check(s) FAILED — review the output above and act on each failure.")
    elif incon:
        warn(f"{len(incon)} check(s) were INCONCLUSIVE — manual verification recommended.")
    else:
        ok("All checks PASSED. The `stages` table looks healthy.")

    print()
    info("Supabase RLS docs:         https://supabase.com/docs/guides/database/postgres/row-level-security")
    info("Supabase Dashboard Policies: Dashboard → Table Editor → stages → RLS tab")


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def _parse_error(exc):
    """Extract (code, message) from a supabase-py exception."""
    if exc.args and isinstance(exc.args[0], dict):
        return exc.args[0].get("code", ""), exc.args[0].get("message", str(exc))
    return "", str(exc)


def _print_stages_table(data):
    """Pretty-print a compact table of stage rows."""
    print(f"  {'STAGE_NAME':<14}  {'ASANA_ID':<10}  TITLE")
    print(f"  {'─'*14}  {'─'*10}  {'─'*40}")
    for row in data:
        sname = str(row.get("stage_name", ""))[:14]
        aid   = str(row.get("asana_id",   ""))[:10]
        title = str(row.get("title",      ""))[:40]
        print(f"  {sname:<14}  {aid:<10}  {title}")


def _print_name_analysis_table(seen: dict, roman: list, non_roman: list, type_fail: list):
    """Print stage_name values with their roman/non-roman classification."""
    all_names = list(seen.keys())
    print(f"  {'STAGE_NAME':<16}  {'COUNT':>6}  {'ROMAN?':<8}  TYPE")
    print(f"  {'─'*16}  {'─'*6}  {'─'*8}  {'─'*10}")
    for name in sorted(all_names, key=lambda n: (n is None, str(n))):
        count    = seen[name]
        is_roman = name in roman
        is_type  = "int" if isinstance(name, int) else ("str" if isinstance(name, str) else type(name).__name__)
        roman_lbl = f"{GREEN}Yes{RESET}" if is_roman else f"{YELLOW}No{RESET}"
        type_lbl  = f"{GREEN}str{RESET}" if is_type == "str" else f"{RED}{is_type}{RESET}"
        disp_name = repr(name)[:16]
        print(f"  {disp_name:<16}  {count:>6}  {roman_lbl:<17}  {type_lbl}")


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print(f"\n{BOLD}{'═'*64}{RESET}")
    print(f"{BOLD}  Yoga App Evolution — Stages Table Audit{RESET}")
    print(f"{BOLD}{'═'*64}{RESET}")
    print(f"  Target:  {SUPABASE_URL}")
    print(f"  Key:     anon (public)\n")

    try:
        from supabase import create_client, Client
    except ImportError:
        fail("supabase-py is not installed.")
        fail("Run:  pip install supabase")
        sys.exit(1)

    client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    check_security(client)
    check_relational_integrity(client)
    check_data_consistency(client)
    check_orphans(client)
    print_summary()

    print(f"\n{BOLD}Audit complete.{RESET}\n")
