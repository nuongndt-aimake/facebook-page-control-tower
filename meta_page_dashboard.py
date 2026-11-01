"""Meta Page Control Tower - local-only daily Page reporting.

No third-party packages are required.  See README_META_DASHBOARD.md first.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "meta_dashboard"
DB_PATH = DATA_DIR / "dashboard.sqlite3"
CONFIG_PATH = ROOT / ".env.meta.example"
API_VERSION = "v26.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


def env(name: str, required: bool = True) -> str:
    value = os.getenv(name, "").strip()
    if required and not value:
        raise RuntimeError(f"Thiếu {name}. Sao chép .env.meta.example thành .env.meta rồi điền giá trị.")
    return value


def load_dotenv() -> None:
    """Tiny .env loader so credentials never need to be put in source code."""
    path = ROOT / ".env.meta"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_get(path: str, token: str, **params: str) -> dict[str, Any]:
    params["access_token"] = token
    url = f"{BASE_URL}/{path.lstrip('?')}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            detail = json.loads(body)["error"]["message"]
        except (json.JSONDecodeError, KeyError):
            detail = body
        raise RuntimeError(f"Meta API HTTP {error.code}: {detail}") from error


def database() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS pages (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, tasks TEXT,
          page_token TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY, page_id TEXT NOT NULL, created_time TEXT,
          message TEXT, permalink_url TEXT, media_type TEXT, raw_json TEXT,
          synced_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS metrics (
          entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL,
          period TEXT NOT NULL, end_time TEXT, value_json TEXT NOT NULL,
          synced_at TEXT NOT NULL,
          PRIMARY KEY (entity_type, entity_id, metric, period, end_time)
        );
        CREATE TABLE IF NOT EXISTS sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT NOT NULL,
          scope TEXT NOT NULL, status TEXT NOT NULL, detail TEXT
        );
    """)
    return db


def page_token(db: sqlite3.Connection, page_id: str) -> str:
    row = db.execute("SELECT page_token FROM pages WHERE id = ?", (page_id,)).fetchone()
    if not row:
        raise RuntimeError(f"Chưa có Page {page_id}. Chạy discover trước.")
    return row["page_token"]


def discover(db: sqlite3.Connection) -> None:
    token = env("META_USER_ACCESS_TOKEN")
    result = api_get("me/accounts", token, fields="id,name,category,tasks,access_token", limit="100")
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    count = 0
    for page in result.get("data", []):
        if not page.get("access_token"):
            continue
        db.execute("""INSERT INTO pages(id,name,category,tasks,page_token,updated_at)
                      VALUES(?,?,?,?,?,?)
                      ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,
                      tasks=excluded.tasks,page_token=excluded.page_token,updated_at=excluded.updated_at""",
                   (page["id"], page["name"], page.get("category"), json.dumps(page.get("tasks", [])),
                    page["access_token"], now))
        count += 1
    db.commit()
    print(f"Đã lưu {count} Page có thể truy cập. Dùng 'pages' để kiểm tra.")


def save_metrics(db: sqlite3.Connection, entity_type: str, entity_id: str, token: str,
                 metrics: list[str], period: str, since: str, until: str) -> tuple[int, list[str]]:
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    saved, failures = 0, []
    # Query each metric separately: Meta rejects an entire batch when one metric was retired.
    for metric in metrics:
        try:
            result = api_get(f"{entity_id}/insights", token, metric=metric, period=period,
                             since=since, until=until)
            for item in result.get("data", []):
                for value in item.get("values", []):
                    db.execute("""INSERT INTO metrics(entity_type,entity_id,metric,period,end_time,value_json,synced_at)
                                  VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,entity_id,metric,period,end_time)
                                  DO UPDATE SET value_json=excluded.value_json,synced_at=excluded.synced_at""",
                               (entity_type, entity_id, item.get("name", metric), period,
                                value.get("end_time", "lifetime"), json.dumps(value.get("value"), ensure_ascii=False), now))
                    saved += 1
        except RuntimeError as error:
            failures.append(f"{metric}: {error}")
    return saved, failures


def sync_page(db: sqlite3.Connection, page_id: str, since: str, until: str) -> None:
    token = page_token(db, page_id)
    fields = "id,message,created_time,permalink_url,attachments{media_type}"
    result = api_get(f"{page_id}/posts", token, fields=fields, since=since, until=until, limit="100")
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    post_count = 0
    for post in result.get("data", []):
        attachments = post.get("attachments", {}).get("data", [])
        media_type = attachments[0].get("media_type") if attachments else None
        db.execute("""INSERT INTO posts(id,page_id,created_time,message,permalink_url,media_type,raw_json,synced_at)
                      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET message=excluded.message,
                      permalink_url=excluded.permalink_url,media_type=excluded.media_type,raw_json=excluded.raw_json,
                      synced_at=excluded.synced_at""",
                   (post["id"], page_id, post.get("created_time"), post.get("message"), post.get("permalink_url"),
                    media_type, json.dumps(post, ensure_ascii=False), now))
        post_count += 1

    page_metrics = split_metrics(env("META_PAGE_METRICS", False) or "page_post_engagements,page_follows")
    post_metrics = split_metrics(env("META_POST_METRICS", False) or "post_reactions_by_type_total,post_comments,post_shares")
    metric_count, errors = save_metrics(db, "page", page_id, token, page_metrics, "day", since, until)
    for post in result.get("data", []):
        n, problems = save_metrics(db, "post", post["id"], token, post_metrics, "lifetime", since, until)
        metric_count += n
        errors.extend(problems)
    detail = json.dumps({"posts": post_count, "metric_rows": metric_count, "api_warnings": errors}, ensure_ascii=False)
    db.execute("INSERT INTO sync_log(ran_at,scope,status,detail) VALUES(?,?,?,?)",
               (now, page_id, "warning" if errors else "ok", detail))
    db.commit()
    print(f"{page_id}: {post_count} bài, {metric_count} dòng chỉ số" + (f"; {len(errors)} chỉ số không được API hỗ trợ" if errors else ""))


def split_metrics(text: str) -> list[str]:
    return [item.strip() for item in text.split(",") if item.strip()]


def export_csv(db: sqlite3.Connection, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    rows = db.execute("""SELECT p.name AS page_name, po.id AS post_id, po.created_time, po.media_type,
                              po.message, po.permalink_url
                       FROM posts po JOIN pages p ON p.id=po.page_id ORDER BY po.created_time DESC""").fetchall()
    with target.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=["page_name", "post_id", "created_time", "media_type", "message", "permalink_url"])
        writer.writeheader(); writer.writerows(map(dict, rows))
    print(f"Đã xuất {len(rows)} bài: {target}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Meta Page Control Tower")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("discover", help="Lấy Page quản trị bởi Facebook token")
    commands.add_parser("pages", help="Liệt kê Page đã lưu")
    sync = commands.add_parser("sync", help="Đồng bộ Page hoặc toàn bộ Page")
    sync.add_argument("--page-id", help="Bỏ trống để đồng bộ toàn bộ Page")
    sync.add_argument("--since", default=(dt.date.today() - dt.timedelta(days=1)).isoformat())
    sync.add_argument("--until", default=dt.date.today().isoformat())
    export = commands.add_parser("export-posts", help="Xuất nội dung thành CSV mở được bằng Excel")
    export.add_argument("--output", default=str(DATA_DIR / "posts.csv"))
    args = parser.parse_args()
    db = database()
    try:
        if args.command == "discover": discover(db)
        elif args.command == "pages":
            for row in db.execute("SELECT id,name,category,tasks,updated_at FROM pages ORDER BY name"):
                print(f"{row['id']} | {row['name']} | {row['category'] or '-'} | {row['tasks']}")
        elif args.command == "sync":
            ids = [args.page_id] if args.page_id else [r[0] for r in db.execute("SELECT id FROM pages")]
            if not ids: raise RuntimeError("Chưa có Page. Chạy discover trước.")
            for page_id in ids: sync_page(db, page_id, args.since, args.until)
        elif args.command == "export-posts": export_csv(db, Path(args.output).resolve())
    finally:
        db.close()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(f"LỖI: {error}", file=sys.stderr)
        raise SystemExit(2)
