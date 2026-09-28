"""Sparks Maps worker: the one piece n8n can't do itself (driving a real browser).

n8n calls these endpoints with the X-Worker-Secret header. Jobs run one at a time on a
background thread; state lives in JSON files under DATA_DIR so a restart doesn't lose
results, and interrupted lead jobs can be resumed from the last completed query.
When a job finishes (or fails) the worker POSTs a summary to the job's callbackUrl.
"""
from __future__ import annotations

import json
import os
import queue
import threading
import time
import traceback
import urllib.request
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from maps import grid_points, rank_at_point
from pipeline import run_leads

SECRET = os.environ.get("WORKER_SECRET", "")
CALLBACK_SECRET = os.environ.get("WORKER_CALLBACK_SECRET", SECRET)
DATA = Path(os.environ.get("DATA_DIR", "./data"))
(DATA / "jobs").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Sparks Maps Worker")
work: "queue.Queue[tuple[str, str]]" = queue.Queue()
lock = threading.Lock()


def auth(secret: str | None) -> None:
    if not SECRET or secret != SECRET:
        raise HTTPException(401, "bad or missing X-Worker-Secret")


def path(kind: str, job_id: str) -> Path:
    safe = "".join(c for c in job_id if c.isalnum() or c in "-_")[:80]
    if not safe:
        raise HTTPException(400, "bad jobId")
    return DATA / "jobs" / f"{kind}-{safe}.json"


def load(kind: str, job_id: str) -> dict:
    p = path(kind, job_id)
    if not p.exists():
        raise HTTPException(404, f"no {kind} job {job_id}")
    return json.loads(p.read_text(encoding="utf-8"))


def save(kind: str, job: dict) -> None:
    with lock:
        tmp = path(kind, job["jobId"]).with_suffix(".tmp")
        tmp.write_text(json.dumps(job), encoding="utf-8")
        tmp.replace(path(kind, job["jobId"]))


def public(job: dict) -> dict:
    """Job summary without the bulky internals."""
    return {k: v for k, v in job.items() if k not in ("raw", "rows", "queries", "done_queries", "config", "points", "callbackUrl")}


def callback(job: dict, kind: str, final: bool = True) -> None:
    """POST the job summary to n8n. Progress pings are single-shot; the final one retries."""
    url = job.get("callbackUrl")
    if not url:
        return
    body = {"kind": kind, "final": final, **public(job)}
    if kind == "grid":
        body["points"] = job.get("points", [])
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "x-worker-secret": CALLBACK_SECRET})
    for attempt in range(3 if final else 1):
        try:
            urllib.request.urlopen(req, timeout=20 if final else 5).read()
            return
        except Exception as e:  # n8n briefly down: retry, then give up (results are still on disk)
            print(f"callback failed ({attempt + 1}): {e}", flush=True)
            if final:
                time.sleep(5 * (attempt + 1))


_last_ping: dict[str, float] = {}


def progress(kind: str, job: dict) -> None:
    """Persist, and at most every 20s tell n8n how far along we are."""
    save(kind, job)
    now = time.time()
    if now - _last_ping.get(job["jobId"], 0) >= 20:
        _last_ping[job["jobId"]] = now
        callback(job, kind, final=False)


def runner() -> None:
    while True:
        kind, job_id = work.get()
        job = load(kind, job_id)
        log = lambda m: print(f"[{kind}:{job_id}] {m}", flush=True)  # noqa: E731
        try:
            if kind == "leads":
                run_leads(job, lambda j: progress("leads", j), DATA, log)
            else:
                run_grid(job, log)
        except Exception as e:
            traceback.print_exc()
            job["status"], job["message"] = "failed", f"{type(e).__name__}: {e}"
            save(kind, job)
        callback(job, kind)
        work.task_done()


def run_grid(job: dict, log) -> None:
    from playwright.sync_api import sync_playwright

    job["status"] = "running"
    save("grid", job)
    pts = grid_points(job["centerLat"], job["centerLng"], job["gridSize"], job["spacingKm"])
    job["points"] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        page = browser.new_context(locale="en-AU", viewport={"width": 1400, "height": 900},
                                   geolocation={"latitude": job["centerLat"], "longitude": job["centerLng"]},
                                   permissions=["geolocation"]).new_page()
        for lat, lng in pts:
            try:
                job["points"].append(rank_at_point(page, job["keyword"], lat, lng, job["businessName"], job["depth"]))
            except Exception as e:
                log(f"point {lat},{lng} failed: {e}")
                job["points"].append({"lat": lat, "lng": lng, "rank": None, "top": [], "error": str(e)[:120]})
            progress("grid", job)
        browser.close()
    job["status"] = "done"
    save("grid", job)


@app.on_event("startup")
def startup() -> None:
    # Anything mid-run when the worker died is marked interrupted (resumable), not silently lost.
    for f in (DATA / "jobs").glob("*.json"):
        job = json.loads(f.read_text(encoding="utf-8"))
        if job.get("status") in ("queued", "scraping", "verifying", "extracting", "running"):
            job["status"] = "interrupted"
            job["message"] = "The worker restarted mid-run. Resume continues from the last completed search."
            f.write_text(json.dumps(job), encoding="utf-8")
    threading.Thread(target=runner, daemon=True).start()


class Query(BaseModel):
    query: str
    category: str
    suburb: str


class LeadJobIn(BaseModel):
    jobId: str
    label: str = ""
    config: dict
    queries: list[Query] = Field(max_length=600)
    callbackUrl: str | None = None


class GridJobIn(BaseModel):
    jobId: str
    keyword: str
    businessName: str
    gridSize: int = Field(ge=3, le=9)
    spacingKm: float = Field(gt=0, le=10)
    centerLat: float
    centerLng: float
    depth: int = Field(default=20, ge=5, le=40)
    callbackUrl: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "queued": work.qsize()}


@app.post("/leads/jobs", status_code=202)
def start_leads(body: LeadJobIn, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    if int(body.config.get("target", 0)) < 1:
        raise HTTPException(400, "config.target must be at least 1")
    job = {
        "jobId": body.jobId, "label": body.label, "config": body.config, "queries": [q.model_dump() for q in body.queries],
        "callbackUrl": body.callbackUrl, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "queued",
        "target": body.config["target"], "queriesTotal": len(body.queries), "queriesDone": 0, "scraped": 0, "unique": 0,
        "phoneVerified": 0, "withEmail": 0, "withDecisionMaker": 0, "withDirectMobile": 0, "widenedInto": [],
    }
    save("leads", job)
    work.put(("leads", body.jobId))
    return public(job)


@app.post("/leads/jobs/{job_id}/resume", status_code=202)
def resume_leads(job_id: str, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    job = load("leads", job_id)
    if job["status"] not in ("interrupted", "failed"):
        raise HTTPException(409, f"job is {job['status']}, not resumable")
    job["status"] = "queued"
    save("leads", job)
    work.put(("leads", job_id))
    return public(job)


@app.get("/leads/jobs/{job_id}")
def get_leads(job_id: str, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    return public(load("leads", job_id))


@app.get("/leads/jobs/{job_id}/rows")
def get_rows(job_id: str, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    return load("leads", job_id).get("rows", [])


@app.post("/grid/jobs", status_code=202)
def start_grid(body: GridJobIn, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    job = {**body.model_dump(), "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "status": "queued", "points": []}
    save("grid", job)
    work.put(("grid", body.jobId))
    return public(job)


@app.get("/grid/jobs/{job_id}")
def get_grid(job_id: str, x_worker_secret: str | None = Header(None)):
    auth(x_worker_secret)
    job = load("grid", job_id)
    return {**public(job), "points": job.get("points", [])}
