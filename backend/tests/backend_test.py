import os
import time
import uuid
import pytest
import requests

# Public base URL from Expo frontend env (user-facing)
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jota-android-editor.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("message") == "NexaEdit API"


# ---------- Sync (push & pull) ----------
class TestSync:
    def _doc(self, _id="d1", content="hello", updated=1000.0):
        return {
            "id": _id,
            "name": "Welcome.md",
            "content": content,
            "language": "markdown",
            "pinned": False,
            "createdAt": 100.0,
            "updatedAt": updated,
        }

    def test_invalid_sync_code_push_returns_400(self, client):
        r = client.post(f"{API}/sync/push", json={"sync_id": "bad!", "docs": []}, timeout=15)
        assert r.status_code == 400, r.text

    def test_invalid_sync_code_pull_returns_400(self, client):
        r = client.get(f"{API}/sync/pull/bad!", timeout=15)
        assert r.status_code == 400, r.text

    def test_push_then_pull_persists(self, client):
        sid = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        docs = [self._doc("doc-A", "first", 1000.0), self._doc("doc-B", "second", 1001.0)]
        r = client.post(f"{API}/sync/push", json={"sync_id": sid, "docs": docs}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["sync_id"] == sid
        assert body["count"] == 2

        # pull back
        r2 = client.get(f"{API}/sync/pull/{sid}", timeout=20)
        assert r2.status_code == 200
        pulled = r2.json()
        assert pulled["sync_id"] == sid
        ids = {d["id"] for d in pulled["docs"]}
        assert ids == {"doc-A", "doc-B"}

    def test_merge_by_updated_at(self, client):
        sid = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        # initial
        r = client.post(f"{API}/sync/push",
                        json={"sync_id": sid, "docs": [self._doc("x", "old", 100.0)]}, timeout=20)
        assert r.status_code == 200
        # newer wins
        r2 = client.post(f"{API}/sync/push",
                         json={"sync_id": sid, "docs": [self._doc("x", "new", 999.0)]}, timeout=20)
        assert r2.status_code == 200
        # older must NOT overwrite
        r3 = client.post(f"{API}/sync/push",
                         json={"sync_id": sid, "docs": [self._doc("x", "stale", 50.0)]}, timeout=20)
        assert r3.status_code == 200

        pulled = client.get(f"{API}/sync/pull/{sid}", timeout=20).json()
        doc = next(d for d in pulled["docs"] if d["id"] == "x")
        assert doc["content"] == "new", f"expected merge-by-updatedAt, got {doc}"

    def test_pull_unknown_returns_empty(self, client):
        sid = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        r = client.get(f"{API}/sync/pull/{sid}", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["sync_id"] == sid
        assert body["docs"] == []


# ---------- AI coach (slow) ----------
class TestAICoach:
    def test_empty_text_returns_400(self, client):
        r = client.post(f"{API}/ai/coach", json={"text": "   ", "mode": "writing", "language": "plaintext"}, timeout=30)
        assert r.status_code == 400, r.text

    @pytest.mark.timeout(90)
    def test_writing_mode(self, client):
        payload = {"text": "i recieve alot of email every day and its hard to manage",
                   "mode": "writing", "language": "plaintext"}
        start = time.time()
        r = client.post(f"{API}/ai/coach", json=payload, timeout=120)
        dur = time.time() - start
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("score"), int)
        assert 0 <= body["score"] <= 100
        assert isinstance(body.get("summary"), str)
        assert isinstance(body.get("issues"), list)
        assert isinstance(body.get("tips"), list)
        # has at least one spelling-ish fix for 'recieve' or 'alot'
        joined = " ".join(i.get("original", "") for i in body["issues"]).lower()
        assert ("reciev" in joined) or ("alot" in joined) or len(body["issues"]) >= 1
        print(f"writing coach took {dur:.1f}s, issues={len(body['issues'])}, tips={len(body['tips'])}")

    @pytest.mark.timeout(90)
    def test_code_mode(self, client):
        payload = {
            "text": "function add(a,b){ return a+b }\nvar x = 1\nconsole.log(x)\n",
            "mode": "code",
            "language": "javascript",
        }
        r = client.post(f"{API}/ai/coach", json=payload, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body["score"], int) and 0 <= body["score"] <= 100
        assert isinstance(body["issues"], list)
        assert isinstance(body["tips"], list)
