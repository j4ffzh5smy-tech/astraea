# -*- coding: utf-8 -*-
# start.py — 一键启动使用统计：本地收集器 + cloudflared 公网隧道
# 隧道地址生成后自动写入 tracker.json 并推送到 GitHub，线上游戏即可找到统计入口。
# 关闭本窗口（或按 Ctrl+C）后停止统计，并把 tracker.json 置空再推一次。
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
CF = os.path.join(BASE, "cloudflared.exe")
CF_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
TRACKER = os.path.join(ROOT, "tracker.json")
PORT = 8931


def ensure_cloudflared():
    if os.path.exists(CF):
        return
    print("首次运行，下载 cloudflared（约 35MB）……")
    urllib.request.urlretrieve(CF_URL, CF)
    print("下载完成。")


def push_tracker(endpoint):
    with open(TRACKER, "w", encoding="utf-8") as f:
        json.dump({"endpoint": endpoint}, f, ensure_ascii=False)
    subprocess.run(["git", "add", "tracker.json"], cwd=ROOT)
    subprocess.run(["git", "commit", "-m", "更新统计入口"],
                   cwd=ROOT, capture_output=True)
    r = subprocess.run(["git", "push"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode == 0:
        print("统计入口已同步到线上。")
    else:
        print("（git push 未成功，线上游戏暂时收不到新地址，可稍后重开本程序）")


def main():
    ensure_cloudflared()

    server = subprocess.Popen([sys.executable, os.path.join(BASE, "server.py")], cwd=BASE)
    print("本地仪表盘: http://127.0.0.1:%d" % PORT)

    cf = subprocess.Popen(
        [CF, "tunnel", "--url", "http://127.0.0.1:%d" % PORT, "--no-autoupdate"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")

    url = None
    print("正在建立公网隧道……")
    try:
        while True:
            line = cf.stdout.readline()
            if not line:
                break
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if m:
                url = m.group(0)
                break
        if not url:
            print("隧道建立失败，请检查网络后重试。")
            server.terminate()
            return
        print("公网统计入口: %s" % url)
        push_tracker(url)
        print("\n统计已开启，保持本窗口开着即可。关掉窗口即停止统计。\n")
        cf.wait()
    except KeyboardInterrupt:
        pass
    finally:
        cf.terminate()
        server.terminate()
        print("正在关闭并通知线上停止统计……")
        push_tracker(None)
        print("已停止。")


if __name__ == "__main__":
    main()
