#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data_raw" / "worldcup2026"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    # 104-match schedule/results + pre-match 1X2 market odds.
    "llm_schedule_group.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/schedule.csv",
    "llm_results_group.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/results.csv",
    "llm_odds_group.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/odds.csv",
    "llm_schedule_knockout.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/schedule_knockout.csv",
    "llm_results_knockout.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/results_knockout.csv",
    "llm_odds_knockout.csv": "https://raw.githubusercontent.com/graphuofm/FIFA2026LLM/main/data/metadata/odds_knockout.csv",

    # Independent 104-match detailed result/event dataset.
    "hf_matches.csv": "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/matches.csv?download=true",
    "hf_matches_detailed.csv": "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/matches_detailed.csv?download=true",
    "hf_match_events.csv": "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/match_events.csv?download=true",
    "hf_match_team_stats.csv": "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/match_team_stats.csv?download=true",
    "hf_teams.csv": "https://huggingface.co/datasets/Mominullptr/fifa-world-cup-2026-dataset/resolve/main/teams.csv?download=true",
}

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 WorldCupRebirthDataArchive/1.0",
    "Accept": "text/csv,text/plain,*/*",
})


def download(name: str, url: str) -> dict:
    path = OUT / name
    last = None
    for attempt in range(4):
        try:
            r = SESSION.get(url, timeout=40)
            r.raise_for_status()
            data = r.content
            if len(data) < 20:
                raise RuntimeError(f"Downloaded payload too small ({len(data)} bytes)")
            path.write_bytes(data)
            return {
                "file": str(path.relative_to(ROOT)),
                "url": url,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        except Exception as exc:
            last = exc
            time.sleep(2 + attempt * 2)
    raise RuntimeError(f"Failed to download {url}: {last}")


def count_csv_rows(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return max(0, sum(1 for _ in csv.reader(f)) - 1)


def combine_1x2() -> int:
    srcs = [OUT / "llm_odds_group.csv", OUT / "llm_odds_knockout.csv"]
    rows = []
    fieldnames = None
    for src in srcs:
        with src.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            fieldnames = fieldnames or reader.fieldnames
            rows.extend(reader)
    rows.sort(key=lambda r: int(str(r["match_id"]).lstrip("m")))
    dst = OUT / "market_1x2_104.csv"
    with dst.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def combine_schedule_results() -> int:
    schedule = {}
    for name in ["llm_schedule_group.csv", "llm_schedule_knockout.csv"]:
        with (OUT / name).open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                schedule[row["match_id"]] = row
    results = {}
    for name in ["llm_results_group.csv", "llm_results_knockout.csv"]:
        with (OUT / name).open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                results[row["match_id"]] = row

    ids = sorted(set(schedule) | set(results), key=lambda x: int(str(x).lstrip("m")))
    all_fields = ["match_id"]
    seen = {"match_id"}
    for container in (schedule, results):
        for row in container.values():
            for k in row:
                if k not in seen:
                    all_fields.append(k)
                    seen.add(k)

    dst = OUT / "schedule_results_104.csv"
    with dst.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=all_fields)
        w.writeheader()
        for mid in ids:
            row = {"match_id": mid}
            row.update(schedule.get(mid, {}))
            # If a result column collides, prefer the results table for truth.
            row.update(results.get(mid, {}))
            w.writerow(row)
    return len(ids)


def main() -> None:
    report = {"sources": [], "checks": {}, "errors": []}
    for name, url in SOURCES.items():
        try:
            report["sources"].append(download(name, url))
            print(f"downloaded {name}", flush=True)
        except Exception as exc:
            report["errors"].append({"file": name, "error": str(exc)})
            print(f"ERROR {name}: {exc}", flush=True)

    if report["errors"]:
        (OUT / "download_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        raise SystemExit(2)

    expected = {
        "llm_schedule_group.csv": 72,
        "llm_results_group.csv": 72,
        "llm_odds_group.csv": 72,
        "llm_schedule_knockout.csv": 32,
        "llm_results_knockout.csv": 32,
        "llm_odds_knockout.csv": 32,
        "hf_matches.csv": 104,
        "hf_matches_detailed.csv": 104,
    }
    for name, n in expected.items():
        actual = count_csv_rows(OUT / name)
        report["checks"][name] = {"rows": actual, "expected": n, "ok": actual == n}
        if actual != n:
            report["errors"].append({"file": name, "error": f"row count {actual}, expected {n}"})

    report["checks"]["market_1x2_104.csv"] = {"rows": combine_1x2(), "expected": 104}
    report["checks"]["schedule_results_104.csv"] = {"rows": combine_schedule_results(), "expected": 104}

    (OUT / "download_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if report["errors"]:
        raise SystemExit(2)
    print("Raw World Cup archive complete.")


if __name__ == "__main__":
    main()
