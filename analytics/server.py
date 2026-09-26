# -*- coding: utf-8 -*-
# server.py — 魔导纪元使用统计收集器 + 本地仪表盘
# 玩家浏览器每 30 秒向 /ping 发一次匿名心跳（pid=玩家标识, sid=会话标识），
# 本机 http://127.0.0.1:8931 打开仪表盘实时查看数据。
import json
import os
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# 无窗口（pythonw）运行时 stdout 为 None，重定向防止 print 报错
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "data.db")
EXCLUDE_FILE = os.path.join(BASE, "exclude_pids.txt")
LOG_FILE = os.path.join(BASE, "requests.log")
PORT = 8931
ONLINE_WINDOW = 90          # 90 秒内有心跳视为在线
SESSION_TAIL = 30           # 会话结束时长补偿：最后一个心跳后再计 30 秒


def load_exclude_pids():
    # exclude_pids.txt：每行一个要排除的 pid（# 开头为注释），作者本人等不计入统计
    pids = set()
    try:
        with open(EXCLUDE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    pids.add(line)
    except OSError:
        pass
    return pids


exclude_pids = load_exclude_pids()

db_lock = threading.Lock()
conn = sqlite3.connect(DB, check_same_thread=False)
conn.execute("""CREATE TABLE IF NOT EXISTS sessions(
  sid TEXT PRIMARY KEY,
  pid TEXT NOT NULL,
  first_ts REAL NOT NULL,
  last_ts REAL NOT NULL,
  pings INTEGER NOT NULL DEFAULT 1
)""")
conn.commit()


def clean(s, n=64):
    s = (s or "")[:n]
    return "".join(c for c in s if c.isalnum() or c in "-_")


def record(pid, sid):
    if pid in exclude_pids:
        return
    now = time.time()
    with db_lock:
        row = conn.execute("SELECT 1 FROM sessions WHERE sid=?", (sid,)).fetchone()
        if row:
            conn.execute("UPDATE sessions SET last_ts=?, pings=pings+1 WHERE sid=?", (now, sid))
        else:
            conn.execute("INSERT INTO sessions(sid,pid,first_ts,last_ts,pings) VALUES(?,?,?,?,1)",
                         (sid, pid, now, now))
        conn.commit()


def day_start(ts=None):
    t = time.localtime(ts or time.time())
    return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, 0))


def stats():
    now = time.time()
    with db_lock:
        rows = conn.execute("SELECT sid,pid,first_ts,last_ts,pings FROM sessions").fetchall()
    sessions = []
    for sid, pid, f, l, p in rows:
        active = (now - l) <= ONLINE_WINDOW
        end = now if active else (l + SESSION_TAIL)
        sessions.append({
            "sid": sid, "pid": pid, "first": f, "last": l, "pings": p,
            "active": active, "dur": max(0.0, end - f),
        })
    online = [s for s in sessions if s["active"]]
    today = [s for s in sessions if s["first"] >= day_start()]
    durs = [s["dur"] for s in sessions]
    return {
        "now": now,
        "online_users": len({s["pid"] for s in online}),
        "online_sessions": len(online),
        "total_users": len({s["pid"] for s in sessions}),
        "total_sessions": len(sessions),
        "avg_dur": (sum(durs) / len(durs)) if durs else 0.0,
        "max_dur": max(durs) if durs else 0.0,
        "today_users": len({s["pid"] for s in today}),
        "today_sessions": len(today),
        "recent": sorted(sessions, key=lambda s: s["last"], reverse=True)[:30],
    }


DASHBOARD = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>魔导纪元 · 使用统计</title>
<style>
  body { background:#100c08; color:#ead9b8; font-family:"Microsoft YaHei",sans-serif; margin:0; padding:28px; }
  h1 { font-size:20px; color:#e0aa45; letter-spacing:4px; margin:0 0 4px; }
  .sub { color:#b09b74; font-size:13px; margin-bottom:22px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; }
  .card { background:#221a12; border:1px solid #4a3823; border-radius:8px; padding:16px 18px; }
  .card .k { font-size:13px; color:#b09b74; letter-spacing:2px; }
  .card .v { font-size:32px; color:#f5c96b; margin-top:6px; font-weight:700; }
  .card.live .v { color:#86a95c; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:#86a95c; margin-right:6px; animation:p 1.6s infinite; }
  @keyframes p { 0%,100%{opacity:.5} 50%{opacity:1} }
  h2 { font-size:15px; color:#e0aa45; letter-spacing:3px; margin:26px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:7px 10px; border-bottom:1px solid #33291d; }
  th { color:#b09b74; font-weight:400; letter-spacing:1px; }
  .on { color:#86a95c; }
  .off { color:#6e6252; }
  #updated { color:#6e6252; font-size:12px; margin-top:14px; }
</style>
</head>
<body>
<h1>魔导纪元 · 使用统计</h1>
<div class="sub">每 5 秒自动刷新 · 在线判定：90 秒内有心跳</div>
<div class="cards">
  <div class="card live"><div class="k"><span class="dot"></span>当前在线人数</div><div class="v" id="online"></div></div>
  <div class="card"><div class="k">总使用人数</div><div class="v" id="users"></div></div>
  <div class="card"><div class="k">平均在线时长</div><div class="v" id="avg"></div></div>
  <div class="card"><div class="k">最高在线时长</div><div class="v" id="max"></div></div>
  <div class="card"><div class="k">总会话数</div><div class="v" id="sess"></div></div>
  <div class="card"><div class="k">今日活跃玩家</div><div class="v" id="tusers"></div></div>
  <div class="card"><div class="k">今日会话数</div><div class="v" id="tsess"></div></div>
</div>
<h2>最近会话（最多 30 条）</h2>
<table>
  <thead><tr><th>状态</th><th>玩家</th><th>开始时间</th><th>最后心跳</th><th>时长</th><th>心跳数</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<div id="updated"></div>
<script>
function fmtDur(s) {
  s = Math.round(s);
  if (s < 60) return s + " 秒";
  if (s < 3600) return Math.floor(s/60) + " 分 " + (s%60) + " 秒";
  return Math.floor(s/3600) + " 小时 " + Math.floor((s%3600)/60) + " 分";
}
function fmtTime(ts) {
  const d = new Date(ts*1000);
  const p = n => String(n).padStart(2,"0");
  return (d.getMonth()+1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
async function refresh() {
  try {
    const r = await fetch("/api/stats?_=" + Date.now());
    const j = await r.json();
    document.getElementById("online").textContent = j.online_users;
    document.getElementById("users").textContent = j.total_users;
    document.getElementById("avg").textContent = fmtDur(j.avg_dur);
    document.getElementById("max").textContent = fmtDur(j.max_dur);
    document.getElementById("sess").textContent = j.total_sessions;
    document.getElementById("tusers").textContent = j.today_users;
    document.getElementById("tsess").textContent = j.today_sessions;
    document.getElementById("rows").innerHTML = j.recent.map(s =>
      "<tr><td class='" + (s.active ? "on'>● 在线" : "off'>○ 离线") + "</td>" +
      "<td>" + s.pid.slice(0,8) + "</td>" +
      "<td>" + fmtTime(s.first) + "</td>" +
      "<td>" + fmtTime(s.last) + "</td>" +
      "<td>" + fmtDur(s.dur) + "</td>" +
      "<td>" + s.pings + "</td></tr>").join("");
    document.getElementById("updated").textContent = "上次刷新：" + new Date().toLocaleTimeString();
  } catch (e) {}
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")

    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _route(self):
        u = urlparse(self.path)
        if u.path == "/ping":
            q = parse_qs(u.query)
            pid = clean((q.get("pid") or [""])[0])
            sid = clean((q.get("sid") or [""])[0])
            self.log_request_line("/ping", "pid=" + (pid or "?") + " sid=" + (sid or "?"))
            if pid and sid:
                record(pid, sid)
            return self._send(200, "ok")
        if u.path == "/api/stats":
            return self._send(200, json.dumps(stats()), "application/json; charset=utf-8")
        if u.path in ("/", "/index.html"):
            return self._send(200, DASHBOARD, "text/html; charset=utf-8")
        return self._send(404, "not found")

    def do_GET(self):
        self._route()

    def do_POST(self):
        # 兼容 sendBeacon（带 body 的 POST）
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n:
                self.rfile.read(n)
        except Exception:
            pass
        self._route()

    def log_message(self, *a):
        pass

    def log_request_line(self, path, extra=""):
        # 请求流水：时间 IP 路径 附加信息，用于排查玩家心跳是否到达
        try:
            ts = time.strftime("%m-%d %H:%M:%S", time.localtime())
            ip = self.client_address[0] if self.client_address else "-"
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write("%s %s %s %s\n" % (ts, ip, path, extra))
        except Exception:
            pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("统计仪表盘: http://127.0.0.1:%d" % PORT)
    srv.serve_forever()
