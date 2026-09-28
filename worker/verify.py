"""Stage 2: check each lead against its own website.

- phone_verified: do the Maps phone's digits appear on the business's own site?
- own-domain (or freemail) emails from home + about/team/contact pages, including /contact and /contact-us
- every crawled page's text is cached to disk (keyed by URL hash) for the decision-maker pass
"""
from __future__ import annotations

import hashlib
import html as H
import re
import urllib.parse
import urllib.request
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"}
SKIP_HOSTS = ("facebook.com", "instagram.com", "linktr.ee", "goo.gl", "google.com", "business.site", "yellowpages.com.au")
LINK_RX = re.compile(r"about|team|story|contact|who|owner|meet|people|our-", re.I)
EMAIL_RX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
FREEMAIL = ("gmail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "yahoo.com.au", "icloud.com", "bigpond.com", "bigpond.net.au", "optusnet.com.au", "iinet.net.au", "tpg.com.au")
PLACEHOLDER = ("example", "domain.com", "yourdomain", "your@", "user@", "name@", "email@", "sentry", "wixpress", "godaddy", "@2x", ".png", ".jpg", ".webp", ".svg", "test@", "noreply", "no-reply")


def fetch(url: str, timeout: int = 8) -> str:
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)
        return r.read(700_000).decode("utf-8", "ignore")
    except Exception:
        return ""


def to_text(h: str) -> str:
    h = re.sub(r"(?is)<(script|style|noscript|svg).*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|td|tr|section)>", " | ", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", H.unescape(h)).strip()


def digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def root_domain(host: str) -> str:
    host = host.lower().removeprefix("www.")
    parts = host.split(".")
    return ".".join(parts[-3:]) if host.endswith((".com.au", ".net.au", ".org.au", ".co.nz")) else ".".join(parts[-2:])


def good_email(e: str, root: str) -> bool:
    e = e.lower().strip(".")
    if any(p in e for p in PLACEHOLDER):
        return False
    dom = e.split("@")[-1]
    return dom == root or dom.endswith("." + root) or dom in FREEMAIL


def crawl(website: str, cache_dir: Path) -> dict | None:
    """Returns {pages: {url: html}, cache_key} or None when there's nothing to crawl."""
    url = (website or "").split("?")[0].split("#")[0]
    host = urllib.parse.urlparse(url).netloc.lower()
    if not url or not host or any(s in host for s in SKIP_HOSTS):
        return None
    home = fetch(url)
    if not home:
        return None
    pages = {url: home}
    base = host.removeprefix("www.")
    links = set()
    for m in re.findall(r'href=["\']([^"\'#]+)["\']', home):
        if LINK_RX.search(m) and not re.search(r"\.(jpe?g|png|pdf|css|js|svg|webp)(\?|$)", m, re.I):
            full = urllib.parse.urljoin(url, m)
            if urllib.parse.urlparse(full).netloc.lower().removeprefix("www.") == base:
                links.add(full.split("#")[0])
    for extra in ("/contact", "/contact-us"):
        links.add(urllib.parse.urljoin(url, extra))
    for link in sorted(links)[:7]:
        if link not in pages:
            body = fetch(link)
            if body:
                pages[link] = body
    key = hashlib.md5(website.encode()).hexdigest()[:12]
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / f"{key}.txt").write_text(" ||| ".join(to_text(v) for v in pages.values()), encoding="utf-8")
    return {"pages": pages, "cache_key": key}


def verify_lead(lead: dict, cache_dir: Path) -> dict:
    r = dict(lead)
    r.update(phone_verified="", own_emails="", cache_key="")
    if not r.get("website"):
        r["phone_verified"] = "no website found — phone from Google Maps only" if r.get("phone") else ""
        return r
    got = crawl(r["website"], cache_dir)
    if not got:
        r["phone_verified"] = "No (website unreachable)"
        return r
    raw = " ".join(got["pages"].values())
    ph = digits(r.get("phone", ""))[-8:]
    r["phone_verified"] = "Yes" if ph and ph in digits(to_text(raw)) + digits(raw) else "No"
    root = root_domain(urllib.parse.urlparse(r["website"]).netloc)
    emails = sorted({e.lower().strip(".") for e in EMAIL_RX.findall(raw) if good_email(e, root)})
    own = [e for e in emails if not e.endswith(FREEMAIL)]
    r["own_emails"] = ";".join(own + [e for e in emails if e not in own])
    r["cache_key"] = got["cache_key"]
    return r
