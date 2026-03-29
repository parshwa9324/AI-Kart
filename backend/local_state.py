# Shared memory state for Windows where Redis is unavailable.
# Since we use FastAPI BackgroundTasks instead of an external RQ worker process,
# the HTTP thread and the worker thread exist in the exact same process.
# We can safely share state using a local dictionary guarded by a lock.

from threading import Lock
from typing import Any

LOCAL_JOBS: dict[str, dict[str, Any]] = {}
LOCAL_JOBS_LOCK = Lock()


def init_job(job_id: str, payload: dict[str, Any]) -> None:
    with LOCAL_JOBS_LOCK:
        LOCAL_JOBS[job_id] = payload


def update_job(job_id: str, updates: dict[str, Any]) -> None:
    with LOCAL_JOBS_LOCK:
        if job_id in LOCAL_JOBS:
            LOCAL_JOBS[job_id].update(updates)


def get_job(job_id: str) -> dict[str, Any] | None:
    with LOCAL_JOBS_LOCK:
        job = LOCAL_JOBS.get(job_id)
        if job is None:
            return None
        return dict(job)
