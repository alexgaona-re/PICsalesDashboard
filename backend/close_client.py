"""Close CRM API client with caching, pagination, and rate-limit handling."""

import os
import time
import threading
import requests
from requests.auth import HTTPBasicAuth


class CloseClient:
    BASE_URL = "https://api.close.com/api/v1"

    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("CLOSE_API_KEY")
        if not self.api_key:
            raise ValueError("CLOSE_API_KEY environment variable is required")
        self.session = requests.Session()
        self.session.auth = HTTPBasicAuth(self.api_key, "")
        self.session.headers.update({"Accept": "application/json"})
        self._cache = {}
        self._cache_lock = threading.Lock()
        self.CACHE_TTL = 900  # 15 minutes

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    def _request(self, method, endpoint, params=None, json_data=None):
        """Make an API request with retry/backoff for rate limits."""
        url = f"{self.BASE_URL}/{endpoint}"
        for attempt in range(4):
            try:
                resp = self.session.request(method, url, params=params, json=json_data)
                if resp.status_code == 429:
                    wait = float(resp.headers.get("Retry-After", 2 ** (attempt + 1)))
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.ConnectionError:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                raise
        return {}

    def _get_paginated(self, endpoint, params=None):
        """Iterate through all pages of a list endpoint."""
        if params is None:
            params = {}
        params["_limit"] = 100
        skip = 0
        results = []
        while True:
            params["_skip"] = skip
            data = self._request("GET", endpoint, params=dict(params))
            items = data.get("data", [])
            results.extend(items)
            if not data.get("has_more", False):
                break
            skip += len(items)
        return results

    def _cached(self, key, fetch_fn):
        """Return cached data when fresh; otherwise fetch, cache, and return."""
        with self._cache_lock:
            if key in self._cache:
                ts, val = self._cache[key]
                if time.time() - ts < self.CACHE_TTL:
                    return val
        val = fetch_fn()
        with self._cache_lock:
            self._cache[key] = (time.time(), val)
        return val

    def clear_cache(self):
        """Flush the entire in-memory cache."""
        with self._cache_lock:
            self._cache.clear()

    # ------------------------------------------------------------------
    # Domain methods
    # ------------------------------------------------------------------

    def get_active_users(self):
        """Return active Close organisation members."""
        def _fetch():
            resp = self._request("GET", "user")
            users = resp.get("data", []) if isinstance(resp, dict) else []
            return [
                {
                    "id": u["id"],
                    "first_name": u.get("first_name", ""),
                    "last_name": u.get("last_name", ""),
                    "email": u.get("email", ""),
                    "image": u.get("image", ""),
                }
                for u in users
                if not u.get("date_deactivated")
            ]
        return self._cached("active_users", _fetch)

    def get_calls(self, date_from, date_to):
        """All call activities in [date_from, date_to)."""
        params = {
            "date_created__gte": date_from,
            "date_created__lt": date_to,
        }
        key = f"calls:{date_from}:{date_to}"
        return self._cached(key, lambda: self._get_paginated("activity/call", params))

    def get_emails(self, date_from, date_to):
        """All email activities in [date_from, date_to)."""
        params = {
            "date_created__gte": date_from,
            "date_created__lt": date_to,
        }
        key = f"emails:{date_from}:{date_to}"
        return self._cached(key, lambda: self._get_paginated("activity/email", params))

    def get_won_opportunities(self):
        """All opportunities with status_type='won'."""
        params = {"status_type": "won"}
        return self._cached("won_opps", lambda: self._get_paginated("opportunity", params))
