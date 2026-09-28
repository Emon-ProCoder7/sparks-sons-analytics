"""Lead-finder pipeline: scrape -> filter/dedupe -> (widen) -> verify -> decision-makers -> size -> rank.

Runs one query at a time in a single browser (deliberately conservative on Google Maps).
Progress is saved after every query so an interrupted job resumes from the last
completed query instead of starting over.
"""
from __future__ import annotations

import concurrent.futures as cf
import re
from pathlib import Path
from typing import Callable

from playwright.sync_api import sync_playwright

import dm
from maps import scrape_query
from verify import digits, verify_lead

COLUMNS = [
    "business_name", "category", "suburb_area", "address", "business_phone", "phone_verified_on_own_site",
    "business_email", "website", "google_rating", "google_reviews", "decision_maker_name", "decision_maker_role",
    "decision_maker_direct_mobile", "decision_maker_shared_with_other_listing", "decision_maker_source",
    "business_size_estimate", "size_basis", "maps_search_query",
]


def in_state(address: str, state: str) -> bool:
    if not address:
        return True  # can't tell; keep rather than silently drop
    return bool(re.search(rf"\b{re.escape(state)}\b", address)) or (state == "VIC" and "Victoria" in address)


def size_estimate(r: dict, franchise: list[str], national: list[str]) -> tuple[str, str]:
    name = r.get("name", "").lower()
    if any(b and b in name for b in national):
        return "national corporate — general contact only, low personal-outreach value", "known national brand"
    n = int(r.get("reviews") or 0)
    basis = f"Google review count ({n}) as a volume proxy — Maps has no staff or revenue data"
    if any(b and b in name for b in franchise):
        return "franchise — independently owned office", basis
    if n >= 150:
        return "larger local operator", basis
    if n >= 40:
        return "established small business", basis
    if n >= 10:
        return "small business", basis
    return "very small or new", basis


def rank_key(r: dict):
    return (r.get("phone_verified") != "Yes", not r.get("own_emails"), -int(r.get("reviews") or 0))


def to_row(r: dict, franchise: list[str], national: list[str]) -> dict:
    size, basis = size_estimate(r, franchise, national)
    return {
        "business_name": r.get("name", ""),
        "category": r.get("category") or r.get("lead_category", ""),
        "suburb_area": r.get("suburb", ""),
        "address": r.get("address", ""),
        "business_phone": r.get("phone", ""),
        "phone_verified_on_own_site": r.get("phone_verified", ""),
        "business_email": (r.get("own_emails") or "").split(";")[0],
        "website": r.get("website", ""),
        "google_rating": r.get("rating", ""),
        "google_reviews": r.get("reviews", ""),
        "decision_maker_name": r.get("dm_name", ""),
        "decision_maker_role": r.get("dm_role", ""),
        "decision_maker_direct_mobile": r.get("dm_mobile", ""),
        "decision_maker_shared_with_other_listing": r.get("dm_shared", ""),
        "decision_maker_source": r.get("dm_source", ""),
        "business_size_estimate": size,
        "size_basis": basis,
        "maps_search_query": r.get("query", ""),
    }


def ring_queries(categories: list[dict], suburbs: list[str], state: str) -> list[dict]:
    return [{"query": f"{v} in {s} {state}", "category": c["label"], "suburb": s}
            for c in categories for s in suburbs for v in c["variants"] if v.strip()]


def run_leads(job: dict, save: Callable[[dict], None], data_dir: Path, log=print) -> None:
    """`job` is mutated in place and persisted via save() after every step."""
    cfg = job["config"]
    state, target, per_q = cfg.get("state", "VIC"), int(cfg["target"]), int(cfg.get("maxPerQuery", 20))
    cache = data_dir / "cache"
    job.setdefault("raw", [])
    job.setdefault("done_queries", [])
    job.setdefault("widenedInto", [])
    seen = {(r["name"].lower(), digits(r.get("phone", ""))) for r in job["raw"]}

    def unique() -> int:
        return len(job["raw"])

    def run_batch(queries: list[dict]) -> None:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
            page = browser.new_context(locale="en-AU", viewport={"width": 1400, "height": 900}).new_page()
            for q in queries:
                if q["query"] in job["done_queries"]:
                    continue  # resume support
                if job.get("cancel"):
                    return
                log(f"query: {q['query']}")
                try:
                    rows = scrape_query(page, q["query"], per_q, log)
                except Exception as e:
                    log(f"query failed: {e}")
                    rows = []
                job["scraped"] += len(rows)
                for r in rows:
                    if not in_state(r["address"], state):
                        job["droppedOutOfState"] = job.get("droppedOutOfState", 0) + 1
                        continue
                    key = (r["name"].lower(), digits(r["phone"]))
                    if key in seen:
                        continue
                    seen.add(key)
                    r.update(lead_category=q["category"], suburb=q["suburb"])
                    job["raw"].append(r)
                job["done_queries"].append(q["query"])
                job["queriesDone"] = len(job["done_queries"])
                job["unique"] = unique()
                save(job)
            browser.close()

    job.update(status="scraping", scraped=job.get("scraped", 0))
    job["queriesTotal"] = max(job.get("queriesTotal", 0), len(job["queries"]))
    save(job)
    run_batch(job["queries"])

    # widen ring by ring only if the chosen suburbs came up short
    if cfg.get("widen") and unique() < target:
        for ring in cfg.get("rings", []):
            if unique() >= target or job.get("cancel"):
                break
            job["widenReason"] = f"only {unique()} unique leads from the chosen suburbs; target is {target}"
            job["widenedInto"] += [s for s in ring if s not in job["widenedInto"]]
            extra = ring_queries(cfg["categories"], ring, state)
            job["queriesTotal"] += len([q for q in extra if q["query"] not in job["done_queries"]])
            save(job)
            run_batch(extra)

    leads = job["raw"]
    if cfg.get("verifyPhones", True):
        job["status"] = "verifying"
        save(job)
        with cf.ThreadPoolExecutor(8) as ex:
            leads = list(ex.map(lambda r: verify_lead(r, cache), leads))
        job["phoneVerified"] = sum(r["phone_verified"] == "Yes" for r in leads)
        job["withEmail"] = sum(bool(r["own_emails"]) for r in leads)

    if cfg.get("findDecisionMakers", True):
        job["status"] = "extracting"
        save(job)
        leads = dm.run(leads, cache)
        job["withDecisionMaker"] = sum(bool(r.get("dm_name")) for r in leads)
        job["withDirectMobile"] = sum(bool(r.get("dm_mobile")) for r in leads)

    leads.sort(key=rank_key)
    fr, nat = cfg.get("franchiseBrands", []), cfg.get("nationalBrands", [])
    job["rows"] = [to_row(r, fr, nat) for r in leads[:target]]
    job["status"] = "done"
    job["message"] = (
        f"{len(job['rows'])} leads delivered from {unique()} unique listings"
        + (f"; {job.get('droppedOutOfState', 0)} results outside {state} dropped" if job.get("droppedOutOfState") else "")
        + ("" if unique() >= target else
           f". Only {unique()} found, short of the {target} target"
           + (" even after widening." if job["widenedInto"] else "; turn on widening or add suburbs/phrasings to find more."))
    )
    save(job)
