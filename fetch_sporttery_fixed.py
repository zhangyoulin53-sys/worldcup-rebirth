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

ROOT = Path(__file__).resolve().parents[1]
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
    # 竞彩足球编号日为北京时间 11:30 至次日 11:30。
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


def row_issue(text):
    m = re.search(r"(?:周[一二三四五六日天])?\s*(\d{3})\b", text)
    return int(m.group(1)) if m else None


def nums(text):
    return [float(x) for x in NUM_RE.findall(text)]


def numeric_run(values, length, predicate):
    for i in range(len(values) - length + 1):
        chunk = values[i:i+length]
        if predicate(chunk):
            return chunk
    return None


def parse_cpbao_spf(html):
    """Return issue -> {wdl, handicap}."""
    out = {}
    soup = BeautifulSoup(html, "html.parser")
    for tr in soup.find_all("tr"):
        text = " ".join(tr.stripped_strings)
        if "世界杯" not in text:
            continue
        issue = row_issue(text)
        if not issue:
            continue
        values = nums(text)
        # Find [0,H,D,A,line,H,D,A]. Ignore issue number, score and rankings.
        chunk = numeric_run(values, 8, lambda c:
            abs(c[0]) <= 0.01 and -4 <= c[4] <= 4 and float(c[4]).is_integer() and
            all(0 <= x <= 1000 for x in (c[1],c[2],c[3],c[5],c[6],c[7])))
        if not chunk:
            continue
        _, H, D, A, line, HH, HD, HA = chunk
        out[issue] = {
            "wdl":{"H":H,"D":D,"A":A},
            "handicap":{"line":int(line),"H":HH,"D":HD,"A":HA},
        }
    return out


def parse_cpbao_simple(html, count):
    """Return issue -> ordered odds array for JQS/BQQ pages."""
    out = {}
    soup = BeautifulSoup(html, "html.parser")
    for tr in soup.find_all("tr"):
        text = " ".join(tr.stripped_strings)
        if "世界杯" not in text:
            continue
        issue = row_issue(text)
        if not issue:
            continue
        values = nums(text)
        # Odds are a contiguous run > 1.00. The issue and full-time score appear first.
        candidates = []
        for i in range(len(values)-count+1):
            c = values[i:i+count]
            if all(1.0 <= x <= 2000 for x in c):
                candidates.append((i,c))
        if not candidates:
            continue
        # Prefer the first run after the issue/score; runs including issue 001 are rejected by value 1.0 only
        # when followed by score zero, so the first valid run is normally the market row.
        out[issue] = candidates[0][1]
    return out


def fetch_cpbao_markets(matches):
    dates = sorted({business_date(m) for m in matches})
    spf, goals, htft = {}, {}, {}
    for n, bd in enumerate(dates, 1):
        print(f"[cpbao {n}/{len(dates)}] {bd}", flush=True)
        u1 = f"https://www.cpbao.com/jczq/scheme%21editNew.action?matchDate={bd}&passMode=SINGLE&playType=SPF"
        u2 = f"https://www.cpbao.com/jczq/scheme%21editNew.action?matchDate={bd}&passMode=PASS&playType=JQS"
        u3 = f"https://www.cpbao.com/jczq/scheme%21editNew.action?matchDate={bd}&passMode=PASS&playType=BQQ"
        spf.update(parse_cpbao_spf(get(u1)))
        goals.update(parse_cpbao_simple(get(u2), 8))
        htft.update(parse_cpbao_simple(get(u3), 9))
        time.sleep(0.7)
    return spf, goals, htft


def next_number(tokens, start):
    for i in range(start, min(len(tokens), start + 7)):
        if re.fullmatch(r"[+-]?\d+(?:\.\d+)?", tokens[i]):
            return float(tokens[i]), i
    raise ValueError(f"No numeric value near token #{start}")


def value_after(tokens, label, start=0):
    for i in range(start, len(tokens)):
        if tokens[i] == label:
            return next_number(tokens, i+1)
    raise ValueError(f"Label not found: {label}")


def parse_shzrs_score(html, expected_home, expected_away):
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else soup.title.get_text(" ", strip=True) if soup.title else ""
    nt = norm_name(title)
    if norm_name(expected_home) not in nt or norm_name(expected_away) not in nt:
        raise ValueError(f"Team mismatch: expected {expected_home} vs {expected_away}, page={title}")
    tokens = [x.strip() for x in soup.stripped_strings if x.strip()]
    # Find the score market marker, then consume all 31 labels in order.
    try:
        start = next(i for i,x in enumerate(tokens) if x == "胜" and i > 0 and "客胜" in tokens[max(0,i-12):i])
    except StopIteration:
        start = 0
    score = {}
    cursor = start
    for label in SCORE_LABELS:
        val, pos = value_after(tokens, label, cursor)
        score[label.replace("其他","其它")] = val
        cursor = pos + 1
    return score


def fetch_scores(matches):
    out, errors = {}, []
    for issue, match in enumerate(matches, 1):
        bd = business_date(match)
        code = f"{bd[2:]}{issue:03d}"
        url = f"https://www.shzrs.com/jczq/bsid.php?t={code}"
        print(f"[score {issue:03d}/104] {match['home']} vs {match['away']} {code}", flush=True)
        try:
            out[issue] = parse_shzrs_score(get(url), match["home"], match["away"])
        except Exception as exc:
            errors.append({"issue":issue,"url":url,"error":str(exc)})
        time.sleep(0.65)
    return out, errors


def fetch_half_scores(matches):
    by_date = {}
    for issue, match in enumerate(matches, 1):
        by_date.setdefault(business_date(match), set()).add(issue)
    out = {}
    for n, bd in enumerate(sorted(by_date), 1):
        print(f"[half {n}/{len(by_date)}] {bd}", flush=True)
        url = f"https://www.cpbao.com/jc/jcResult%21getJczcResultNew.action?matchDate={bd}&playType=BQQ&t=1"
        soup = BeautifulSoup(get(url), "html.parser")
        for tr in soup.find_all("tr"):
            text = " ".join(tr.stripped_strings)
            if "世界杯" not in text:
                continue
            issue = row_issue(text)
            if issue not in by_date[bd]:
                continue
            # Result pages expose halftime | fulltime as e.g. 1:0 | 2:0.
            mm = re.search(r"(\d+)\s*:\s*(\d+)\s*\|\s*(\d+)\s*:\s*(\d+)", text)
            if mm:
                out[issue] = [int(mm.group(1)), int(mm.group(2))]
        time.sleep(0.55)
    return out


def main():
    matches = load_matches()
    spf, goals, htft = fetch_cpbao_markets(matches)
    scores, score_errors = fetch_scores(matches)
    halves = fetch_half_scores(matches)

    result, errors = {}, list(score_errors)
    for issue, match in enumerate(matches, 1):
        missing = []
        if issue not in spf: missing.append("spf")
        if issue not in goals: missing.append("goals")
        if issue not in htft: missing.append("htft")
        if issue not in scores: missing.append("score")
        if issue not in halves: missing.append("halfScore")
        if missing:
            errors.append({"issue":issue,"matchId":match["matchId"],"home":match["home"],"away":match["away"],"missing":missing})
            continue
        g = goals[issue]
        h = htft[issue]
        bd = business_date(match)
        result[match["matchId"]] = {
            "wdl": spf[issue]["wdl"],
            "handicap": spf[issue]["handicap"],
            "score": scores[issue],
            "goals": dict(zip(["0","1","2","3","4","5","6","7+"], g)),
            "htft": dict(zip(HTFT_CODES, h)),
            "halfScore": halves[issue],
            "issue": f"{bd[2:]}{issue:03d}",
        }

    report = {
        "expected":104,
        "loaded":len(result),
        "spf":len(spf),
        "goals":len(goals),
        "htft":len(htft),
        "scores":len(scores),
        "half_scores":len(halves),
        "errors":errors,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if len(result) != 104:
        raise RuntimeError(f"Incomplete import: {len(result)}/104. See {REPORT.name}")

    js = "/* 2026 World Cup historical 竞彩足球 fixed-bonus snapshots. Auto-generated. */\n"
    js += "const SPORTTERY_FIXED=" + json.dumps(result, ensure_ascii=False, separators=(",",":")) + ";\n"
    OUT.write_text(js, encoding="utf-8")
    print(f"Wrote {OUT}: 104/104 matches", flush=True)

if __name__ == "__main__":
    main()
