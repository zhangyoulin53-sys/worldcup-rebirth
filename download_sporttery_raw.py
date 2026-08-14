#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data_raw" / "sporttery2026"
OUT.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
})

# Canonical aliases used by our app and the historical site.
ALIASES = [
    ("刚果民主共和国", "刚果金"), ("民主刚果", "刚果金"), ("刚果（金）", "刚果金"), ("刚果(金)", "刚果金"),
    ("沙特阿拉伯", "沙特"), ("波斯尼亚和黑塞哥维那", "波黑"),
    ("捷克共和国", "捷克"), ("韩国共和国", "韩国"),
    ("佛得角共和国", "佛得角"), ("科特迪瓦共和国", "科特迪瓦"),
    ("阿尔及利", "阿尔及利亚"),
]


def load_matches():
    days = []
    for path in sorted(ROOT.glob("data-*.js")):
        if path.name == "data-core.js":
            continue
        text = path.read_text(encoding="utf-8")
        m = re.search(r"DAYS\.push\(\.\.\.(\[.*\])\);\s*$", text, flags=re.S)
        if not m:
            raise RuntimeError(f"Cannot parse {path.name}")
        days.extend(json.loads(m.group(1)))
    matches = [m for d in days for m in d["matches"]]
    if len(matches) != 104:
        raise RuntimeError(f"Expected 104 matches, got {len(matches)}")
    return matches


def canonical_text(x):
    x = str(x).replace("（", "(").replace("）", ")")
    for src, dst in ALIASES:
        x = x.replace(src, dst)
    x = re.sub(r"[\s()（）·.\-]", "", x)
    return x


def candidate_dates(match):
    dt = datetime.strptime(match["date"] + " " + match["time"], "%Y-%m-%d %H:%M")
    dates = []
    biz = dt - timedelta(days=1) if (dt.hour, dt.minute) < (11, 30) else dt
    for x in [biz, dt, dt - timedelta(days=1), dt + timedelta(days=1), dt - timedelta(days=2), dt + timedelta(days=2)]:
        s = x.strftime("%y%m%d")
        if s not in dates:
            dates.append(s)
    return dates


def candidate_issues(idx):
    # World Cup issue numbers mostly follow tournament order. Simultaneous final
    # group matches can be reordered within a small block, so search nearby IDs.
    out = [idx]
    for delta in range(1, 7):
        for n in (idx - delta, idx + delta):
            if 1 <= n <= 104 and n not in out:
                out.append(n)
    return out


def get_html(url, tries=2):
    last = None
    for attempt in range(tries):
        try:
            r = SESSION.get(url, timeout=16)
            if r.status_code == 200:
                if not r.encoding or r.encoding.lower() == "iso-8859-1":
                    r.encoding = r.apparent_encoding or "utf-8"
                return r.text
            last = RuntimeError(f"HTTP {r.status_code}")
        except requests.RequestException as exc:
            last = exc
        time.sleep(0.35 + attempt * 0.5)
    raise RuntimeError(str(last))


def page_matches(html, home, away):
    text = " ".join(BeautifulSoup(html, "html.parser").stripped_strings)
    nt = canonical_text(text)
    return canonical_text(home) in nt and canonical_text(away) in nt


def fetch_one(idx, match):
    errors = []
    dates = candidate_dates(match)
    issues = candidate_issues(idx)

    # Fast path: expected issue number across likely dates.
    candidates = [(d, idx) for d in dates]
    # Fallback: nearby issue numbers across the same date window.
    candidates.extend((d, issue) for issue in issues[1:] for d in dates)

    seen = set()
    for d, issue in candidates:
        sid = f"{d}{issue:03d}"
        if sid in seen:
            continue
        seen.add(sid)
        url = f"https://www.shzrs.com/jczq/bsid.php?t={sid}"
        try:
            html = get_html(url)
            if page_matches(html, match["home"], match["away"]):
                # Remove stale raw page for this tournament position if a prior run mapped it differently.
                for old in OUT.glob(f"{idx:03d}_*_*.html"):
                    old.unlink(missing_ok=True)
                filename = f"{idx:03d}_{sid}_{match['matchId']}.html"
                (OUT / filename).write_text(html, encoding="utf-8")
                return {
                    "tournamentOrder": idx,
                    "sportteryIssue": issue,
                    "matchId": match["matchId"],
                    "home": match["home"],
                    "away": match["away"],
                    "sid": sid,
                    "url": url,
                    "file": str((OUT / filename).relative_to(ROOT)),
                    "status": "ok",
                }
            if len(errors) < 20:
                errors.append(f"{sid}: teams mismatch")
        except Exception as exc:
            if len(errors) < 20:
                errors.append(f"{sid}: {exc}")
    return {
        "tournamentOrder": idx,
        "matchId": match["matchId"],
        "home": match["home"],
        "away": match["away"],
        "status": "error",
        "errors": errors,
    }


def main():
    matches = load_matches()
    mapping = [None] * len(matches)
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(fetch_one, i, m): i for i, m in enumerate(matches, start=1)}
        for fut in as_completed(futures):
            i = futures[fut]
            rec = fut.result()
            mapping[i - 1] = rec
            print(f"[{i:03d}/104] {rec['home']} vs {rec['away']} -> {rec.get('sid', 'ERROR')}", flush=True)

    ok = [x for x in mapping if x and x["status"] == "ok"]
    bad = [x for x in mapping if not x or x["status"] != "ok"]
    report = {"total": len(matches), "downloaded": len(ok), "failed": len(bad), "mapping": mapping}
    (OUT / "mapping.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["tournamentOrder\tsportteryIssue\tmatchId\thome\taway\tsid\turl\tstatus"]
    for x in mapping:
        lines.append("\t".join([
            str(x.get("tournamentOrder", "")), str(x.get("sportteryIssue", "")), x.get("matchId", ""),
            x.get("home", ""), x.get("away", ""), x.get("sid", ""), x.get("url", ""), x.get("status", ""),
        ]))
    (OUT / "mapping.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if bad:
        print(f"Downloaded {len(ok)}/104; {len(bad)} unresolved", flush=True)
        raise SystemExit(2)
    print("Downloaded all 104 historical Sporttery pages.")


if __name__ == "__main__":
    main()
