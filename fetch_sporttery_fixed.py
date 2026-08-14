#!/usr/bin/env python3
"""Build the game market dataset entirely from archived raw files.

No network requests are made here. Required inputs are downloaded first by:
- download_worldcup_raw.py
- download_sporttery_raw.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "sporttery-fixed.js"
REPORT = ROOT / "sporttery-fixed-report.json"
RAW_WORLD = ROOT / "data_raw" / "worldcup2026"
RAW_SP = ROOT / "data_raw" / "sporttery2026"

HOME_SCORES = ["1:0","2:0","2:1","3:0","3:1","3:2","4:0","4:1","4:2","5:0","5:1","5:2"]
DRAW_SCORES = ["0:0","1:1","2:2","3:3"]
AWAY_SCORES = ["0:1","0:2","1:2","0:3","1:3","2:3","0:4","1:4","2:4","0:5","1:5","2:5"]
SITE_SCORE_LABELS = HOME_SCORES + ["胜其他"] + DRAW_SCORES + ["平其他"] + AWAY_SCORES + ["负其他"]
APP_SCORE_KEYS = {"胜其他":"胜其它", "平其他":"平其它", "负其他":"负其它"}
HTFT_LABEL_TO_CODE = {
    "胜胜":"HH", "胜平":"HD", "胜负":"HA",
    "平胜":"DH", "平平":"DD", "平负":"DA",
    "负胜":"AH", "负平":"AD", "负负":"AA",
}
ALIASES = [
    ("刚果民主共和国", "刚果金"), ("民主刚果", "刚果金"), ("刚果（金）", "刚果金"), ("刚果(金)", "刚果金"),
    ("沙特阿拉伯", "沙特"), ("波斯尼亚和黑塞哥维那", "波黑"),
    ("捷克共和国", "捷克"), ("韩国共和国", "韩国"),
    ("佛得角共和国", "佛得角"), ("科特迪瓦共和国", "科特迪瓦"),
    ("阿尔及利", "阿尔及利亚"),
]


def canonical_text(x):
    x = str(x).replace("（", "(").replace("）", ")")
    for src, dst in ALIASES:
        x = x.replace(src, dst)
    return re.sub(r"[\s()（）·.\-]", "", x)


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


def load_mapping():
    path = RAW_SP / "mapping.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("downloaded") != 104 or data.get("failed") != 0:
        raise RuntimeError(f"Sporttery raw archive is incomplete: {data.get('downloaded')}/104")
    mapping = data.get("mapping", [])
    if len(mapping) != 104:
        raise RuntimeError(f"Expected 104 mapping rows, got {len(mapping)}")
    return mapping


def parse_shzrs_page(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    tokens = [str(x).strip() for x in soup.stripped_strings if str(x).strip()]
    text = " ".join(tokens)
    ntext = canonical_text(text)
    if canonical_text(home) not in ntext or canonical_text(away) not in ntext:
        raise RuntimeError("Archived historical page teams do not match fixture")

    top = re.search(
        r"主胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+客胜\s+([0-9.]+)\s+"
        r"让\s+球\s+([+-]?\d+)\s+主胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+客胜\s+([0-9.]+)",
        text,
    )
    if not top:
        raise RuntimeError("Cannot parse 1X2/handicap block")

    wdl = {"H":float(top.group(1)), "D":float(top.group(2)), "A":float(top.group(3))}
    handicap = {"line":int(top.group(4)), "H":float(top.group(5)), "D":float(top.group(6)), "A":float(top.group(7))}

    score = {}
    for label in SITE_SCORE_LABELS:
        m = re.search(re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", text)
        if not m:
            raise RuntimeError(f"Missing score fixed bonus: {label}")
        score[APP_SCORE_KEYS.get(label, label)] = float(m.group(1))

    gm = re.search(r"总\s+进\s+球\s+(.*?)\s+半\s+全\s+场", text)
    if not gm:
        raise RuntimeError("Cannot locate total-goals block")
    gtext = gm.group(1)
    goals = {}
    for label in ["0","1","2","3","4","5","6","7+"]:
        m = re.search(r"(?:^|\s)" + re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", gtext)
        if not m:
            raise RuntimeError(f"Missing total-goals fixed bonus: {label}")
        goals[label] = float(m.group(1))

    hm = re.search(r"半\s+全\s+场\s+(.*)$", text)
    if not hm:
        raise RuntimeError("Cannot locate half/full-time block")
    htext = hm.group(1)
    htft = {}
    for label, code in HTFT_LABEL_TO_CODE.items():
        m = re.search(re.escape(label) + r"\s+([0-9]+(?:\.[0-9]+)?)", htext)
        if not m:
            raise RuntimeError(f"Missing half/full-time fixed bonus: {label}")
        htft[code] = float(m.group(1))

    return {"wdl":wdl, "handicap":handicap, "score":score, "goals":goals, "htft":htft}


def load_half_scores():
    matches_path = RAW_WORLD / "hf_matches.csv"
    events_path = RAW_WORLD / "hf_match_events.csv"
    meta = {}
    with matches_path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            meta[int(row["match_id"])] = (int(row["home_team_id"]), int(row["away_team_id"]))

    halves = {i:[0,0] for i in range(1,105)}
    with events_path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("event_type") != "Goal":
                continue
            try:
                mid = int(row["match_id"])
                minute_text = str(row["minute"]).strip()
                # Supports both plain "45" and stoppage-time forms like "45+2".
                base_minute = int(re.match(r"\d+", minute_text).group())
                team = int(row["team_id"])
            except Exception:
                continue
            if base_minute > 45 or mid not in meta:
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
    if not {"line","H","D","A"}.issubset(rec.get("handicap", {})):
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
    mapping = load_mapping()
    half_scores = load_half_scores()
    dataset = {}
    report = {
        "total":104, "complete":0, "incomplete":[],
        "generatedAt":datetime.now(timezone.utc).isoformat(),
        "marketSource":"archived shzrs historical per-match pages",
        "halfTimeSource":"archived Mominullptr match_events.csv",
        "networkUsed":False,
    }

    for idx, (match, mp) in enumerate(zip(matches, mapping), start=1):
        key = match["matchId"]
        try:
            if mp.get("matchId") != key:
                raise RuntimeError(f"Mapping matchId mismatch: {mp.get('matchId')} vs {key}")
            raw_path = ROOT / mp["file"]
            html = raw_path.read_text(encoding="utf-8")
            markets = parse_shzrs_page(html, match["home"], match["away"])
            half = half_scores.get(idx, [0,0])
            rec = {
                "tournamentOrder":idx,
                "sportteryIssue":mp.get("sportteryIssue"),
                "sid":mp.get("sid"),
                "date":match["date"], "time":match["time"],
                "home":match["home"], "away":match["away"],
                "source":mp.get("url"),
                "wdl":markets["wdl"], "handicap":markets["handicap"],
                "score":markets["score"], "goals":markets["goals"], "htft":markets["htft"],
                "halfScore":half,
                "truth":settle_truth(match, half, markets["handicap"]["line"]),
            }
            missing = validate_record(rec)
            if missing:
                report["incomplete"].append({"matchId":key,"order":idx,"missing":missing})
            else:
                report["complete"] += 1
            dataset[key] = rec
            print(f"[{idx:03d}/104] {match['home']} vs {match['away']} complete={not missing}", flush=True)
        except Exception as exc:
            report["incomplete"].append({"matchId":key,"order":idx,"home":match["home"],"away":match["away"],"error":str(exc)})
            print(f"[{idx:03d}/104] ERROR {match['home']} vs {match['away']}: {exc}", file=sys.stderr, flush=True)

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT.write_text("window.SPORTTERY_FIXED = " + json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

    if report["incomplete"]:
        print(f"Incomplete records: {len(report['incomplete'])}; see {REPORT.name}", file=sys.stderr)
        raise SystemExit(2)
    print("All 104 archived historical fixed-bonus records imported successfully.")


if __name__ == "__main__":
    main()
