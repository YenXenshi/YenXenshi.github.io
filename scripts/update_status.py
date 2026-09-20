#!/usr/bin/env python3
"""Pings every listed RSPS website and refreshes its online/offline status in servers.json."""
import json
from datetime import datetime, timezone
from pathlib import Path

import requests

DATA_FILE = Path(__file__).resolve().parent.parent / "servers.json"
TIMEOUT_SECONDS = 10


def check_status(url: str) -> str:
    try:
        resp = requests.get(url, timeout=TIMEOUT_SECONDS, headers={"User-Agent": "rsps-toplist-uptime-check"})
        return "online" if resp.status_code < 500 else "offline"
    except requests.RequestException:
        return "offline"


def main() -> None:
    data = json.loads(DATA_FILE.read_text())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    for server in data["servers"]:
        server["status"] = check_status(server["website"])
        server["last_checked"] = now

    DATA_FILE.write_text(json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
