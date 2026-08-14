#!/usr/bin/env python3
"""Build the 2026 World Cup historical fixed-bonus dataset.

Primary market source:
- shzrs per-match historical page (one page contains 1X2, handicap 1X2,
  all 31 correct-score options, total-goals and half/full-time fixed bonuses).

Half-time score source:
- Mominullptr/fifa-world-cup-2026-dataset on Hugging Face. We derive the
  half-time score from verified goal events for each tournament match.

The World Cup issue number is the tournament match sequence (001..104). The
business date follows the 竞彩足球 11:30 -> next-day 11:30 boundary.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "sporttery-fixed.js"
REPORT = ROOT / "sporttery-fixed-report.json"

HOME_SCORES = ["1:0","2:0","2:1","3:0","3:1","3:2","4:0","4:1","4:2","5:0","5:1","5:2"]
DRAW_SCORES = ["0:0","1:1","2:2","3:3"]
AWAY_SCORES = ["0:1","0:2","1:2","0:3","1:3","2:3","0:4","1:4","2:4","0:5","1:5","2:5"]
SITE_SCORE_LABELS = HOME_SCORES + ["胜其他"] + DRAW_SCORES + ["平其他"] + AWAY_SCORES + ["负其他"]
APP_SCORE_KEYS = {
    "胜其他":"胜其它",
    "平其他":"平其它",
    "负其他":"负其它",
}
HTFT_LABEL_TO_CODE = {
    "胜胜":"HH", "胜平":"HD", "胜负":"HA",
    "平胜":"DH", "平平":"DD", "平负":"DA",
    "负胜":"AH", "负平":"AD", "负负":"AA",
}

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
})


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


def business_date(match):
    dt = datetime.strptime(match["date"] + " " + match["time"], "%Y-%m-%d %H:%M")
    if (dt.hour, dt.minute) < (11, 30):
        dt -= timedelta(days=1)
    return dt.strftime("%Y%m%d")


def get(url, tries=3, timeout=18):
    last = None
    for attempt in range(tries):
        try:
            r = SESSION.get(url, timeout=timeout)
            if r.status_code == 200:
                if not r.encoding or r.encoding.lower() == "iso-8859-1":
                    r.encoding = r.apparent_encoding or "utf-8"
                return r.text
            last = RuntimeError(f"HTTP {r.status_code}: {url}")
        except requests.RequestException as exc:
            last = exc
        time.sleep(1.0 + attempt)
    raise RuntimeError(f"Fetch failed: {url}: {last}")


def norm_name(x):
    x = str(x).replace("（", "(").replace("）", ")")
    x = re.sub(r"[\s()（）·.\-]", "", x)
    aliases = {
        "刚果民主共和国":"刚果金", "民主刚果":"刚果金", "刚果(金)":"刚果金", "刚果（金）":"刚果金",
        "民主刚果":"刚果金", "沙特阿拉伯":"沙特", "波斯尼亚和黑塞哥维那":"波黑",
        "阿尔及利":"阿尔及利亚", "捷克共和国":"捷克",
    }
    return aliases.get(x, x)


def num(x):
    try:
        return float(str(x).strip())
    except Exception:
        return None


def parse_shzrs_page(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    tokens = [str(x).strip() for x in soup.stripped_strings if str(x).strip()]
    text = " ".join(tokens)
    ntext = norm_name(text)
    if norm_name(home) not in ntext or norm_name(away) not in ntext:
        raise RuntimeError("Historical page teams do not match scheduled fixture")

    # The page layout is stable: 1X2, handicap 1X2, score, goals, half/full-time.
    top = re.search(
        r"主胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+客胜\s+([0-9.]+)\s+"
        r"让\s+球\s+([+-]?\d+)\s+主胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+客胜\s+([0-9.]+)",
        text,
    )
    if not top:
        raise RuntimeError("Cannot parse 1X2/handicap block")

    wdl = {"H":float(top.group(1)), "D":float(top.group(2)), "A":float(top.group(3))}
    handicap = {
        "line":int(top.group(4)),
        "H":float(top.group(5)), "D":float(top.group(6)), "A":float(top.group(7)),
    }

    score = {}
    for label in SITE_SCORE_LABELS:
        m = re.search(re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", text)
        if not m:
            raise RuntimeError(f"Missing score fixed bonus: {label}")
        score[APP_SCORE_KEYS.get(label, label)] = float(m.group(1))

    goals = {}
    gm = re.search(r"总\s+进\s+球\s+(.*?)\s+半\s+全\s+场", text)
    if not gm:
        raise RuntimeError("Cannot locate total-goals block")
    gtext = gm.group(1)
    for label in ["0","1","2","3","4","5","6","7+"]:
        m = re.search(r"(?:^|\s)" + re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", gtext)
        if not m:
            raise RuntimeError(f"Missing total-goals fixed bonus: {label}")
        goals[label] = float(m.group(1))

    htft = {}
    hm = re.search(r"半\s+全\s+场\s+(.*)$", text)
    if not hm:
        raise RuntimeError("Cannot locate half/full-time block")
    htext = hm.group(1)
    for label, code in HTFT_LABEL_TO_CODE.items():
        m = re.search(re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", htext)
        if not m:
            raise RuntimeError(f"Missing half/full-time fixed bonus: {label}")
        htft[code] = float(m.group(1))

    return {
        "wdl":wdl,
        "handicap":handicap,
        "score":score,
        "goals":goals,
        "htft":htft,
    }


def fetch_fixed_market(match, issue):
    sid = f"{business_date(match)[2:]}{issue:03d}"
    url = f"https://www.shzrs.com/jczq/bsid.php?t={sid}"
    return parse_shzrs_page(get(url), match["home"], match["away"]), url


def load_half_scores():
    """Derive first-half scores from public event data, indexed by match 1..104."""
    base = "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/"
    matches_csv = get(base + "matches.csv?download=true")
    events_csv = get(base + "match_events.csv?download=true")

    meta = {}
    for row in csv.DictReader(io.StringIO(matches_csv)):
        try:
            mid = int(row["match_id"])
            meta[mid] = (int(row["home_team_id"]), int(row["away_team_id"]))
        except Exception:
            continue

    halves = {i:[0,0] for i in range(1,105)}
    for row in csv.DictReader(io.StringIO(events_csv)):
        if row.get("event_type") != "Goal":
            continue
        try:
            mid = int(row["match_id"])
            minute = int(float(row["minute"]))
            team = int(row["team_id"])
        except Exception:
            continue
        if minute > 45 or mid not in meta:
            continue
        home_id, away_id = meta[mid]
        if team == home_id:
            halves[mid][0] += 1
        elif team == away_id:
            halves[mid][1] += 1
    return halves


def settle_truth(match, half_score, handicap_line):
    hg, ag = match["score90"]
    wdl = "H" if hg > ag else ("D" if hg == ag else "A")
    raw_score = f"{hg}:{ag}"
    if raw_score in HOME_SCORES + DRAW_SCORES + AWAY_SCORES:
        score = raw_score
    else:
        score = "胜其它" if hg > ag else ("平其它" if hg == ag else "负其它")
    goals = str(hg + ag) if hg + ag <= 6 else "7+"
    adjusted = hg + handicap_line
    handicap = "H" if adjusted > ag else ("D" if adjusted == ag else "A")
    hr = "H" if half_score[0] > half_score[1] else ("D" if half_score[0] == half_score[1] else "A")
    return {"wdl":wdl, "handicap":handicap, "score":score, "goals":goals, "htft":hr + wdl}


def validate_record(rec):
    missing = []
    if set(rec.get("wdl", {})) != {"H","D","A"}:
        missing.append("wdl")
    hc = rec.get("handicap", {})
    if not {"line","H","D","A"}.issubset(hc):
        missing.append("handicap")
    if len(rec.get("score", {})) != 31:
        missing.append("score")
    if len(rec.get("goals", {})) != 8:
        missing.append("goals")
    if len(rec.get("htft", {})) != 9:
        missing.append("htft")
    if not isinstance(rec.get("halfScore"), list) or len(rec["halfScore"]) != 2:
        missing.append("halfScore")
    return missing


def main():
    matches = load_matches()
    half_scores = load_half_scores()
    dataset = {}
    report = {
        "total":len(matches), "complete":0, "incomplete":[],
        "generatedAt":datetime.now(timezone.utc).isoformat(),
        "marketSource":"shzrs historical per-match pages",
        "halfTimeSource":"Mominullptr/fifa-world-cup-2026-dataset match_events.csv",
    }

    for idx, match in enumerate(matches, start=1):
        key = match.get("matchId") or f"m{idx:02d}"
        try:
            markets, source_url = fetch_fixed_market(match, idx)
            half = half_scores.get(idx, [0,0])
            rec = {
                "issue":idx,
                "date":match["date"],
                "time":match["time"],
                "home":match["home"],
                "away":match["away"],
                "source":source_url,
                "wdl":markets["wdl"],
                "handicap":markets["handicap"],
                "score":markets["score"],
                "goals":markets["goals"],
                "htft":markets["htft"],
                "halfScore":half,
                "truth":settle_truth(match, half, markets["handicap"]["line"]),
            }
            missing = validate_record(rec)
            if missing:
                report["incomplete"].append({"matchId":key,"issue":idx,"home":match["home"],"away":match["away"],"missing":missing})
            else:
                report["complete"] += 1
            dataset[key] = rec
            print(f"[{idx:03d}/104] {match['home']} vs {match['away']} complete={not missing}", flush=True)
        except Exception as exc:
            report["incomplete"].append({"matchId":key,"issue":idx,"home":match["home"],"away":match["away"],"error":str(exc)})
            print(f"[{idx:03d}/104] ERROR {match['home']} vs {match['away']}: {exc}", file=sys.stderr, flush=True)
        time.sleep(0.08)

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT.write_text("window.SPORTTERY_FIXED = " + json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

    if report["incomplete"]:
        print(f"Incomplete records: {len(report['incomplete'])}; see {REPORT.name}", file=sys.stderr)
        raise SystemExit(2)
    print("All 104 historical fixed-bonus records imported successfully.")


if __name__ == "__main__":
    main()
