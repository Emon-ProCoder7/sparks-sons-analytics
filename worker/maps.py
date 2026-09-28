"""Google Maps scraping with real Chromium (Playwright).

Ported from leads/prof-services/scrape_maps_au.py with the stale-panel fix kept intact:
  1. collect every card's own href from the results feed first (no click-through),
  2. navigate fresh to each place URL,
  3. wait for the <h1> to equal that card's name before reading anything,
  4. wait for the address element before reading phone/category/etc.
Also used for the Maps rank grid (search from a given lat/lng, record our position).
"""
from __future__ import annotations

import math
import re
import urllib.parse

from playwright.sync_api import Page, TimeoutError as PWTimeout

CARD = "a.hfpxzc"


def accept_consent(page: Page) -> None:
    for sel in ("button:has-text('Accept all')", "button:has-text('I agree')", "form[action*='consent'] button"):
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=1200):
                btn.click()
                page.wait_for_timeout(800)
                return
        except Exception:
            pass


def _collect_cards(page: Page, max_results: int) -> list[tuple[str, str]]:
    """Scroll the results feed until max_results cards (or the list stops growing)."""
    try:
        page.wait_for_selector("div[role='feed']", timeout=12000)
    except PWTimeout:
        return []
    feed = page.locator("div[role='feed']")
    prev, stable = 0, 0
    for _ in range(16):
        n = feed.locator(CARD).count()
        if n >= max_results:
            break
        stable = stable + 1 if n == prev else 0
        if stable >= 3:
            break
        prev = n
        feed.evaluate("(el) => el.scrollBy(0, 1400)")
        page.wait_for_timeout(900)
    cards = feed.locator(CARD).all()[:max_results]
    return [((c.get_attribute("aria-label") or "").strip(), c.get_attribute("href") or "") for c in cards]


def _attr(page: Page, sel: str, attr: str, strip: str = "") -> str:
    try:
        el = page.locator(sel).first
        if el.count():
            return (el.get_attribute(attr) or "").replace(strip, "").strip()
    except Exception:
        pass
    return ""


def _text(page: Page, sel: str) -> str:
    try:
        el = page.locator(sel).first
        if el.count():
            return el.inner_text(timeout=1500).strip()
    except Exception:
        pass
    return ""


def read_place(page: Page, name: str, href: str) -> dict | None:
    page.goto(href, timeout=30000)
    try:
        page.wait_for_function(
            "(n)=>{const h=document.querySelector('h1.DUwDvf');return !!h && h.innerText.trim()===n}", arg=name, timeout=9000
        )
    except PWTimeout:
        return None  # panel never showed THIS business: skip rather than misattribute
    try:
        page.wait_for_selector("button[data-item-id='address']", timeout=5000)
    except PWTimeout:
        pass
    try:  # the rating block renders a beat after the address
        page.wait_for_selector("div.F7nice span[role='img'][aria-label*='review']", timeout=3000)
    except PWTimeout:
        pass
    page.wait_for_timeout(400)
    reviews_label = _attr(page, "div.F7nice span[role='img'][aria-label*='review']", "aria-label")
    if not reviews_label:  # fallback: the "(134)" text next to the stars
        m = re.search(r"\(([\d,]+)\)", _text(page, "div.F7nice"))
        reviews_label = m.group(1) if m else ""
    return {
        "name": name,
        "category": _text(page, "button.DkEaL"),
        "phone": _attr(page, "button[data-item-id^='phone:']", "aria-label", "Phone:"),
        "website": _attr(page, "a[data-item-id='authority']", "href"),
        "address": _attr(page, "button[data-item-id='address']", "aria-label", "Address:"),
        "rating": _text(page, "div.F7nice span[aria-hidden='true']"),
        "reviews": re.sub(r"[^0-9]", "", reviews_label),
        "maps_url": href,
    }


def scrape_query(page: Page, query: str, max_results: int, log=print) -> list[dict]:
    page.goto("https://www.google.com/maps/search/" + urllib.parse.quote_plus(query) + "?hl=en", timeout=30000)
    page.wait_for_timeout(1200)
    accept_consent(page)
    items = _collect_cards(page, max_results)
    out = []
    for i, (name, href) in enumerate(items):
        if not href or not name:
            continue
        try:
            row = read_place(page, name, href)
        except Exception as e:  # one bad listing never kills the query
            log(f"  [{i+1}] error: {e}")
            continue
        if row is None:
            log(f"  [{i+1}] skip (panel mismatch): {name}")
            continue
        row["query"] = query
        out.append(row)
    return out


# ---------------------------------------------------------------- rank grid

def grid_points(lat: float, lng: float, size: int, spacing_km: float) -> list[tuple[float, float]]:
    half = (size - 1) / 2
    dlat = spacing_km / 111.32
    dlng = spacing_km / (111.32 * math.cos(math.radians(lat)))
    return [(round(lat + (half - r) * dlat, 6), round(lng + (c - half) * dlng, 6)) for r in range(size) for c in range(size)]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("&", " and ")).strip()


def names_match(found: str, wanted: str) -> bool:
    a, b = _norm(found), _norm(wanted)
    return bool(a) and bool(b) and (a == b or b in a or a in b)


def rank_at_point(page: Page, keyword: str, lat: float, lng: float, business: str, depth: int) -> dict:
    url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(keyword)}/@{lat},{lng},14z?hl=en"
    page.goto(url, timeout=30000)
    page.wait_for_timeout(1200)
    accept_consent(page)
    names = [n for n, _ in _collect_cards(page, depth)]
    if not names:  # Maps jumped straight to a single place page
        h1 = _text(page, "h1.DUwDvf")
        names = [h1] if h1 else []
    rank = next((i + 1 for i, n in enumerate(names) if names_match(n, business)), None)
    return {"lat": lat, "lng": lng, "rank": rank, "top": names[:3]}
