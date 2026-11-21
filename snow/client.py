"""Thin Snowflake client for Londonfax.

Auth is key-pair for a SERVICE user, so no password or MFA is involved:
- the private key lives in .secrets/snowflake_key.p8 (never committed)
- the account identifier lives in .env as SNOWFLAKE_ACCOUNT=orgname-accountname
Every function is a safe no-op (returns None / False) until Snowflake is configured,
so the app keeps working without it.
"""
import json
import os
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_PATH = os.path.join(ROOT, ".secrets", "snowflake_key.p8")
_lock = threading.Lock()
_conn = None


def _env():
    env = {}
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith("SNOWFLAKE_")})
    return env


def configured():
    return bool(_env().get("SNOWFLAKE_ACCOUNT")) and os.path.exists(KEY_PATH)


def _connect():
    global _conn
    if _conn is not None:
        return _conn
    import snowflake.connector
    from cryptography.hazmat.primitives import serialization

    env = _env()
    with open(KEY_PATH, "rb") as f:
        key = serialization.load_pem_private_key(f.read(), password=None)
    der = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    _conn = snowflake.connector.connect(
        account=env["SNOWFLAKE_ACCOUNT"],
        user=env.get("SNOWFLAKE_USER", "LONDONFAX_SVC"),
        private_key=der,
        role=env.get("SNOWFLAKE_ROLE", "LONDONFAX_APP"),
        warehouse=env.get("SNOWFLAKE_WAREHOUSE", "LONDONFAX_WH"),
        database=env.get("SNOWFLAKE_DATABASE", "LONDONFAX"),
        schema=env.get("SNOWFLAKE_SCHEMA", "APP"),
        client_session_keep_alive=True,
    )
    return _conn


def query(sql, params=None):
    """Run SQL and return a list of dict rows, or None if Snowflake isn't configured."""
    if not configured():
        return None
    global _conn
    with _lock:
        try:
            cur = _connect().cursor()
        except Exception:
            _conn = None
            raise
        try:
            cur.execute(sql, params or ())
            if cur.description is None:
                return []
            cols = [c[0].lower() for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
        finally:
            cur.close()


MODELS = ("claude-sonnet-4-5", "claude-4-sonnet", "claude-3-7-sonnet", "claude-3-5-sonnet",
          "mistral-large2", "llama3.3-70b", "llama3.1-70b", "snowflake-arctic")
_working_model = None


def cortex(prompt, models=MODELS):
    """Ask Snowflake Cortex AI to write text with AI_COMPLETE (new accounts can't use the legacy
    SNOWFLAKE.CORTEX.COMPLETE). Returns (text, model) or (None, None)."""
    global _working_model
    if not configured():
        return None, None
    order = ([_working_model] if _working_model else []) + [m for m in models if m != _working_model]
    last = None
    for m in order:
        try:
            rows = query("select ai_complete(%s, %s) as t", (m, prompt))
            if rows and rows[0]["t"]:
                _working_model = m
                text = rows[0]["t"]
                if isinstance(text, str) and text.startswith('"') and text.endswith('"'):
                    text = json.loads(text)
                return str(text).strip(), m
        except Exception as e:  # model not available in this account/region: try the next one
            last = e
    if last:
        raise last
    return None, None


def save_game_result(player, round_no, origin, destination, base_minutes, new_minutes, points, room=None, detail=None):
    """Game Mode calls this after each round. No-op without Snowflake."""
    if not configured():
        return False
    query(
        "insert into game_results(room, player, round_no, origin, destination, base_minutes, new_minutes, points, detail) "
        "select %s, %s, %s, %s, %s, %s, %s, %s, parse_json(%s)",
        (room, player, round_no, origin, destination, base_minutes, new_minutes, points, json.dumps(detail or {})),
    )
    return True


def leaderboard(limit=10):
    """All-time Game Mode leaderboard from Snowflake (None without Snowflake)."""
    return query(
        "select player, sum(points) as points, count(*) as rounds, max(played_at) as last_played "
        "from game_results group by player order by points desc limit %s",
        (limit,),
    )
