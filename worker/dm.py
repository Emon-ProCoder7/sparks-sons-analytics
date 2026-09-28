"""Stage 3: decision-maker extraction from the SAME cached page text (no extra fetching).

Rules (from the lead-gen spec):
- priority-ordered role list; search BOTH directions around every role keyword
  ("Name (Role)", "Name — Role", "ROLE: Name", long credential parentheticals)
- blacklist of non-name Title-Case words, grown over cleanup passes; extend it when
  new junk shows up rather than trusting the first pass
- AU mobile/landline within ~150 chars after the match = that person's direct number
- never guess: no match -> blank
"""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROLES = [
    "managing director", "managing partner", "founding director", "founding partner", "senior partner",
    "principal", "director", "founder", "co-founder", "owner", "co-owner", "proprietor", "licensee",
    "general manager", "ceo", "chief executive", "partner", "operations manager", "sales manager",
]
ROLE_RX = "|".join(sorted((re.escape(r) for r in ROLES), key=len, reverse=True))

# Name: 2-3 capitalised tokens; handles O'Brien, McDonald, hyphenated, ALL CAPS.
TOKEN = r"(?:(?:Mc|Mac|O['’]|D['’])?[A-Z][a-z]+(?:-[A-Z][a-z]+)?|[A-Z]{2,}(?:['’\-][A-Z]+)?)(?![A-Za-z'’])"
NAME = rf"({TOKEN}(?:\s+{TOKEN}){{1,2}})"

BLACKLIST = {
    # nav / UI
    "team", "our", "the", "contact", "about", "us", "home", "services", "service", "careers", "news", "blog", "gallery", "menu",
    "read", "more", "learn", "call", "email", "phone", "mobile", "view", "click", "here", "book", "now", "today", "get", "quote",
    "free", "enquire", "enquiry", "submit", "send", "message", "welcome", "meet", "privacy", "policy", "terms", "conditions",
    "copyright", "rights", "reserved", "sitemap", "login", "shop", "cart", "search", "back", "next", "previous", "open", "hours",
    # marketing copy
    "premier", "trusted", "experienced", "quality", "leading", "best", "expert", "experts", "professional", "local", "family",
    "owned", "operated", "since", "years", "why", "choose", "reliable", "affordable", "friendly", "award", "winning", "proudly",
    "servicing", "specialist", "specialists", "solutions", "custom", "new", "used", "range", "products", "support",
    # business words
    "pty", "ltd", "group", "company", "business", "customer", "customers", "client", "clients", "sales", "hire", "parts",
    "trailer", "trailers", "caravan", "caravans", "towbar", "towbars", "equipment", "plant", "landscaping", "building", "builders",
    "construction", "rural", "supplies", "boats", "marine", "motors", "auto", "automotive", "accessories", "centre", "center",
    "real", "estate", "agency", "office", "head", "branch", "store", "workshop", "yard",
    # places / time
    "australia", "australian", "victoria", "vic", "melbourne", "geelong", "north", "south", "east", "west", "street", "st",
    "road", "rd", "drive", "dr", "avenue", "ave", "highway", "hwy", "bellarine", "surf", "coast", "peninsula", "lara", "corio",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april",
    "may", "june", "july", "august", "september", "october", "november", "december",
    # platforms / credentials
    "google", "facebook", "instagram", "linkedin", "youtube", "reviews", "review", "ca", "cpa", "anz", "registered", "tax",
    "agent", "licensed", "accredited", "member", "certified",
    # role words themselves
    "managing", "director", "directors", "partner", "partners", "principal", "founder", "founders", "owner", "owners",
    "proprietor", "licensee", "general", "manager", "managers", "senior", "founding", "chief", "executive", "ceo", "operations",
}

PHONE_RX = re.compile(r"(?:\+?61[\s\-]?|0)[2-478](?:[\s\-]?\d){8}")

ROLE_FIND = re.compile(rf"\b({ROLE_RX})\b", re.I)
NAME_FIND = re.compile(rf"(?<![A-Za-z]){NAME}(?![a-z])")  # case-SENSITIVE on purpose
GAP_BEFORE = re.compile(r"[\s,\-–—|:(]*(?:is\s+|was\s+)?(?:the\s+|our\s+|a\s+)?(?:[a-z&]+\s+){0,2}", re.I)
GAP_AFTER = re.compile(r"\s*[:\-–—,|]?\s*(?:is\s+)?")


def _clean_name(raw: str, business_tokens: set[str]) -> str | None:
    """Trim blacklisted words off the ends ("Meet John Smith" -> "John Smith"), reject if junk remains."""
    toks = raw.split()
    bad = lambda t: t.lower().strip("'’-") in BLACKLIST or t.lower() in business_tokens  # noqa: E731
    while toks and bad(toks[0]):
        toks.pop(0)
    while toks and bad(toks[-1]):
        toks.pop()
    if not 2 <= len(toks) <= 3 or any(bad(t) or len(t) < 2 for t in toks):
        return None
    return " ".join(t.capitalize() if t.isupper() else t for t in toks)


def _name_before(text: str, pos: int, biz: set[str]) -> str | None:
    window_start = max(0, pos - 130)
    best = None
    for m in NAME_FIND.finditer(text, window_start, pos):
        gap = text[m.end():pos]
        in_paren = "(" in gap and ")" not in gap and len(gap) <= 100  # "JANE DOE (CA ANZ, TAX AGENT & FOUNDER"
        if (len(gap) <= 30 and GAP_BEFORE.fullmatch(gap)) or in_paren:
            name = _clean_name(m.group(1), biz)
            if name:
                best = name  # keep the closest one
    return best


def _name_after(text: str, end: int, biz: set[str]) -> str | None:
    m = NAME_FIND.search(text, end, min(len(text), end + 50))
    if m and GAP_AFTER.fullmatch(text[end:m.start()]):
        return _clean_name(m.group(1), biz)
    return None


def extract(text: str, business_name: str) -> dict:
    biz = {t for t in re.findall(r"[a-z]{3,}", business_name.lower())}
    best: tuple[int, str, str, str] | None = None  # (priority, name, role, mobile)
    for rm in ROLE_FIND.finditer(text):
        role = rm.group(1).lower()
        pri = ROLES.index(role) if role in ROLES else len(ROLES)
        if best and pri >= best[0]:
            continue
        name = _name_before(text, rm.start(), biz) or _name_after(text, rm.end(), biz)
        if not name:
            continue
        ph = PHONE_RX.search(text, rm.end(), rm.end() + 150)
        best = (pri, name, role.title().replace("Ceo", "CEO"), ph.group(0).strip() if ph else "")
    if not best:
        return {"name": "", "role": "", "mobile": ""}
    return {"name": best[1], "role": best[2], "mobile": best[3]}


def run(leads: list[dict], cache_dir: Path) -> list[dict]:
    for r in leads:
        r.update(dm_name="", dm_role="", dm_mobile="", dm_shared="", dm_source="")
        key = r.get("cache_key")
        f = cache_dir / f"{key}.txt" if key else None
        if not f or not f.exists():
            continue
        found = extract(f.read_text(encoding="utf-8"), r.get("name", ""))
        if found["name"]:
            r.update(dm_name=found["name"], dm_role=found["role"], dm_mobile=found["mobile"],
                     dm_source="auto-extracted from the business's own website — spot-check before relying on it")
    # same name on 2+ different businesses: flag, don't silently trust or dedupe
    by_name = defaultdict(set)
    for r in leads:
        if r["dm_name"]:
            by_name[r["dm_name"].lower()].add(r.get("name", ""))
    for r in leads:
        if r["dm_name"] and len(by_name[r["dm_name"].lower()]) > 1:
            r["dm_shared"] = "shared with another listing — confirm which office before calling"
    return leads
