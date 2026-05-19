import os
import re
from typing import Dict, List, Tuple

import psycopg
import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
SUPABASE_DB_URL = os.getenv(
    "SUPABASE_DB_URL",
    "postgresql://postgres:postgres@host.docker.internal:54322/postgres",
)

FORBIDDEN_SQL_WORDS = {
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "truncate",
    "grant",
    "revoke",
    "merge",
    "call",
    "execute",
    "copy",
    "vacuum",
    "analyze",
    "reindex",
    "refresh",
    "security",
    "policy",
}


def clean_sql(raw: str) -> str:
    """
    Extract a SQL query from an LLM response.
    Handles fenced code blocks and plain text.
    """
    text = raw.strip()

    fenced = re.search(r"```(?:sql)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    # If the model includes commentary before SELECT/WITH, trim to the first likely SQL start.
    match = re.search(r"\b(select|with)\b", text, flags=re.IGNORECASE)
    if match:
        text = text[match.start():].strip()

    return text.rstrip(";").strip() + ";"


def validate_read_only_sql(sql: str) -> Tuple[bool, str]:
    """
    Very conservative SQL safety gate.
    Allows one statement only.
    Allows SELECT or WITH only.
    Blocks common destructive/admin keywords.
    """
    lowered = sql.lower().strip()

    if not lowered:
        return False, "SQL is empty."

    if not (lowered.startswith("select") or lowered.startswith("with")):
        return False, "Only SELECT or WITH queries are allowed."

    # Only allow a single statement. One trailing semicolon is okay.
    body = lowered.rstrip().rstrip(";")
    if ";" in body:
        return False, "Only one SQL statement is allowed."

    tokens = set(re.findall(r"\b[a-z_]+\b", lowered))
    blocked = sorted(tokens.intersection(FORBIDDEN_SQL_WORDS))
    if blocked:
        return False, f"Blocked keyword(s): {', '.join(blocked)}."

    return True, "SQL passed read-only validation."


def ask_ollama(question: str, schema_context: str = "") -> str:
    system_prompt = f"""
You are a cautious local assistant helping inspect a Supabase Postgres database.

Rules:
- Return one read-only PostgreSQL query only.
- The query must start with SELECT or WITH.
- Do not use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, COPY, CALL, EXECUTE, REFRESH, or SECURITY.
- Prefer small result sets using LIMIT unless the user clearly asks for counts.
- Use public schema unless another schema is clearly needed.
- Do not invent table names if schema context is provided.
- Return SQL only, preferably in a sql code block.

Known schema context:
{schema_context}
""".strip()

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "stream": False,
    }

    response = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json=payload,
        timeout=180,
    )
    response.raise_for_status()
    return response.json()["message"]["content"]


def run_query(sql: str) -> Dict:
    with psycopg.connect(SUPABASE_DB_URL, connect_timeout=10) as conn:
        # Extra safety: make the transaction read-only.
        conn.execute("set transaction read only;")
        with conn.cursor() as cur:
            cur.execute(sql)
            columns = [desc.name for desc in cur.description] if cur.description else []
            rows = cur.fetchall()
            return {
                "columns": columns,
                "rows": [list(row) for row in rows],
                "row_count": len(rows),
            }


def get_schema_summary() -> str:
    sql = """
    select
      table_schema,
      table_name,
      column_name,
      data_type
    from information_schema.columns
    where table_schema in ('public')
    order by table_schema, table_name, ordinal_position
    limit 400;
    """

    result = run_query(sql)
    lines: List[str] = []
    current_table = None

    for row in result["rows"]:
        schema, table, column, data_type = row
        full_table = f"{schema}.{table}"
        if full_table != current_table:
            current_table = full_table
            lines.append(f"\n{full_table}")
        lines.append(f"  - {column}: {data_type}")

    return "\n".join(lines).strip()


@app.route("/")
def index():
    return render_template(
        "index.html",
        ollama_model=OLLAMA_MODEL,
        ollama_base_url=OLLAMA_BASE_URL,
        db_url_masked=SUPABASE_DB_URL.replace("postgres:postgres@", "postgres:****@"),
    )


@app.route("/health")
def health():
    checks = {
        "ollama": False,
        "database": False,
        "model": OLLAMA_MODEL,
    }

    errors = {}

    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
        r.raise_for_status()
        checks["ollama"] = True
    except Exception as exc:
        errors["ollama"] = str(exc)

    try:
        result = run_query("select current_database(), current_user, now();")
        checks["database"] = True
        checks["database_result"] = result
    except Exception as exc:
        errors["database"] = str(exc)

    return jsonify({"checks": checks, "errors": errors})


@app.route("/schema")
def schema():
    try:
        summary = get_schema_summary()
        return jsonify({"ok": True, "schema": summary})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/draft-sql", methods=["POST"])
def draft_sql():
    data = request.get_json(force=True)
    question = data.get("question", "").strip()
    include_schema = bool(data.get("include_schema", True))

    if not question:
        return jsonify({"ok": False, "error": "Question is required."}), 400

    schema_context = ""
    if include_schema:
        schema_context = get_schema_summary()

    try:
        raw = ask_ollama(question, schema_context=schema_context)
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": "Ollama request failed.",
            "details": str(exc),
        }), 502

    sql = clean_sql(raw)
    valid, validation_message = validate_read_only_sql(sql)

    return jsonify({
        "ok": True,
        "raw_model_response": raw,
        "sql": sql,
        "valid": valid,
        "validation_message": validation_message,
    })


@app.route("/run-sql", methods=["POST"])
def run_sql():
    data = request.get_json(force=True)
    sql = clean_sql(data.get("sql", ""))

    valid, validation_message = validate_read_only_sql(sql)
    if not valid:
        return jsonify({
            "ok": False,
            "error": validation_message,
            "sql": sql,
        }), 400

    try:
        result = run_query(sql)
        return jsonify({
            "ok": True,
            "sql": sql,
            "result": result,
        })
    except Exception as exc:
        return jsonify({
            "ok": False,
            "error": str(exc),
            "sql": sql,
        }), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8787, debug=os.getenv("APP_ENV") == "local")
