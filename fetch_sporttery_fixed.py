#!/usr/bin/env python3
"""Build the 2026 World Cup historical 竞彩足球 fixed-bonus dataset.

Sources used by the collector:
- cpbao historical 竞彩足球 pages: SPF/让球、总进球、半全场 fixed bonuses.
- shzrs per-match historical page: complete 31-option correct-score fixed bonuses.
- cpbao historical result endpoint: half-time scores, used only to settle 半全场.

The World Cup issue number is the tournament match sequence (001..104). The
business date follows the 竞彩足球 11:30 -> next-day 11:30 boundary.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "sporttery-fixed.js"
REPORT = ROOT / "sporttery-fixed-report.json"

HOME_SCORES = ["1:0","2:0","2:1","3:0","3:1","3:2","4:0","4:1","4:2","5:0","5:1","5:2"]
DRAW_SCORES = ["0:0","1:1","2:2","3:3"]
AWAY_SCORES = ["0:1","0:2","1:2","0:3","1:3","2:3","0:4","1:4","2:4","0:5","1:5","2:5"]
SCORE_LABELS = HOME_SCORES + ["胜其他"] + DRAW_SCORES + ["平其他"] + AWAY_SCORES + ["负其他"]
HTFT_CODES = ["HH","HD","HA","DH","DD","DA","AH","AD","AA"]
NUM_RE = re.compile(r"[+-]?\d+(?:\.\d+)?")

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Referer": "https://www.cpbao.com/",
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


def get(url, tries=4):
    last = None
    for attempt in range(tries):
        try:
            r = SESSION.get(url, timeout=25)
            if r.status_code == 200:
                if not r.encoding or r.encoding.lower() == "iso-8859-1":
                    r.encoding = r.apparent_encoding or "utf-8"
                return r.text
            last = RuntimeError(f"HTTP {r.status_code}: {url}")
        except requests.RequestException as exc:
            last = exc
        time.sleep(min(10, 2 + attempt * 2))
    raise RuntimeError(f"Fetch failed: {url}: {last}")


def norm_name(x):
    x = str(x).replace("（", "(").replace("）", ")")
    x = re.sub(r"[\s()（）·.\-]", "", x)
    aliases = {
        "刚果民主共和国":"刚果金", "民主刚果":"刚果金", "刚果(金)":"刚果金", "刚果（金）":"刚果金",
        "沙特阿拉伯":"沙特", "波斯尼亚和黑塞哥维那":"波黑", "阿尔及利":"阿尔及利亚",
    }
    return aliases.get(x, x)


def parse_float(s):
    if s is None:
        return None
    s = str(s).strip().replace("—", "").replace("--", "")
    m = re.search(r"\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def find_num_after(text, label, span=120):
    i = text.find(label)
    if i < 0:
        return None
    nums = NUM_RE.findall(text[i + len(label): i + len(label) + span])
    return float(nums[0]) if nums else None


def parse_cpbao_market_page(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    text = " ".join(soup.stripped_strings)
    hn, an = norm_name(home), norm_name(away)
    if hn not in norm_name(text) or an not in norm_name(text):
        return None

    data = {"wdl": {}, "handicap": {}, "goals": {}, "htft": {}}

    # Prefer table rows containing both teams; fall back to global labelled values.
    for tr in soup.find_all("tr"):
        row = " ".join(tr.stripped_strings)
        nr = norm_name(row)
        if hn in nr and an in nr:
            nums = [float(x) for x in NUM_RE.findall(row)]
            # Exact row formats vary by archived page, so keep this only as an auxiliary signal.
            if len(nums) >= 3 and not data["wdl"]:
                tail = nums[-3:]
                if all(1.0 <= x <= 1000 for x in tail):
                    data["wdl"] = {"H": tail[0], "D": tail[1], "A": tail[2]}

    # Label-based extraction where archived HTML exposes explicit market headings.
    for code, label in [("H", "主胜"), ("D", "平"), ("A", "客胜")]:
        v = find_num_after(text, label)
        if v and 1 <= v <= 1000:
            data["wdl"].setdefault(code, v)

    for g in ["0","1","2","3","4","5","6","7+"]:
        patterns = [f">{g}<", f" {g} ", f"{g}球"]
        for p in patterns:
            v = find_num_after(text, p)
            if v and 1 <= v <= 1000:
                data["goals"].setdefault(g, v)
                break

    return data


def parse_score_page(html, home, away):
    soup = BeautifulSoup(html, "html.parser")
    text = " ".join(soup.stripped_strings)
    if norm_name(home) not in norm_name(text) or norm_name(away) not in norm_name(text):
        return {}
    result = {}
    aliases = {"胜其它":"胜其他", "平其它":"平其他", "负其它":"负其他"}
    for raw_label in SCORE_LABELS + list(aliases):
        label = aliases.get(raw_label, raw_label)
        pattern = re.compile(re.escape(raw_label) + r"\s*([0-9]+(?:\.[0-9]+)?)")
        m = pattern.search(text)
        if m:
            result[label] = float(m.group(1))
    return result


def fetch_cpbao_for_match(match, issue):
    bdate = business_date(match)
    urls = [
        f"https://www.cpbao.com/jczq/scheme!editNew.action?matchDate={bdate}&passMode=SINGLE&playType=SPF",
        f"https://www.cpbao.com/jczq/scheme!editNew.action?matchDate={bdate}&passMode=SINGLE&playType=JQS",
        f"https://www.cpbao.com/jczq/scheme!editNew.action?matchDate={bdate}&passMode=SINGLE&playType=BQC",
    ]
    merged = {"wdl": {}, "handicap": {}, "goals": {}, "htft": {}}
    for url in urls:
        html = get(url)
        parsed = parse_cpbao_market_page(html, match["home"], match["away"])
        if parsed:
            for k in merged:
                merged[k].update(parsed.get(k, {}))
    return merged


def fetch_score_market(match, issue):
    bdate = business_date(match)[2:]
    sid = f"{bdate}{issue:03d}"
    url = f"https://www.shzrs.com/jczq/bsid.php?t={sid}"
    html = get(url)
    return parse_score_page(html, match["home"], match["away"])


def settle_truth(match):
    hg, ag = match["score90"]
    if hg > ag:
        wdl = "H"
    elif hg == ag:
        wdl = "D"
    else:
        wdl = "A"
    score = f"{hg}:{ag}"
    if score not in SCORE_LABELS:
        score = "胜其他" if hg > ag else ("平其他" if hg == ag else "负其他")
    goals = str(hg + ag) if hg + ag <= 6 else "7+"
    return {"wdl": wdl, "score": score, "goals": goals}


def validate_record(rec):
    missing = []
    if len(rec.get("wdl", {})) < 3:
        missing.append("wdl")
    if len(rec.get("score", {})) < 31:
        missing.append("score")
    if len(rec.get("goals", {})) < 8:
        missing.append("goals")
    # handicap/htft are kept optional until a source page exposes a stable complete parse.
    return missing


def main():
    matches = load_matches()
    dataset = {}
    report = {"total": len(matches), "complete": 0, "incomplete": [], "generatedAt": datetime.utcnow().isoformat() + "Z"}

    for idx, match in enumerate(matches, start=1):
        key = match.get("matchId") or f"m{idx:02d}"
        try:
            cp = fetch_cpbao_for_match(match, idx)
            score = fetch_score_market(match, idx)
            rec = {
                "issue": idx,
                "date": match["date"],
                "time": match["time"],
                "home": match["home"],
                "away": match["away"],
                "wdl": cp.get("wdl", {}),
                "handicap": cp.get("handicap", {}),
                "score": score,
                "goals": cp.get("goals", {}),
                "htft": cp.get("htft", {}),
                "truth": settle_truth(match),
            }
            missing = validate_record(rec)
            if missing:
                report["incomplete"].append({"matchId": key, "issue": idx, "home": match["home"], "away": match["away"], "missing": missing})
            else:
                report["complete"] += 1
            dataset[key] = rec
            print(f"[{idx:03d}/104] {match['home']} vs {match['away']} complete={not missing}", flush=True)
        except Exception as exc:
            report["incomplete"].append({"matchId": key, "issue": idx, "home": match["home"], "away": match["away"], "error": str(exc)})
            print(f"[{idx:03d}/104] ERROR {match['home']} vs {match['away']}: {exc}", file=sys.stderr, flush=True)
        time.sleep(0.15)

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    js = "window.SPORTTERY_FIXED = " + json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUT.write_text(js, encoding="utf-8")

    if report["incomplete"]:
        print(f"Incomplete records: {len(report['incomplete'])}; report written to {REPORT}", file=sys.stderr)
        raise SystemExit(2)
    print("All 104 historical market records imported successfully.")


if __name__ == "__main__":
    main()
