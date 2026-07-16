import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def make_profile(client, name="Ada", role="student"):
    return client.post("/api/profiles", json={"name": name, "role": role}).json()


def exercise_payload(**overrides):
    payload = {
        "title": "Ends with 'ab'",
        "automaton_type": "DFA",
        "difficulty": "beginner",
        "learning_objective": "DFA construction",
        "description": "Accepts binary strings ending with 'ab'.",
        "reference_nodes_json": "[]",
        "reference_edges_json": "[]",
        "alphabet_json": '["a","b"]',
        "sample_tests_json": '[{"input":"ab","expectedAccept":true},{"input":"ba","expectedAccept":false}]',
        "hints_json": '["Think about the last two characters read."]',
        "is_ai_generated": False,
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------

class TestProfiles:
    def test_create_and_list_profile(self, client):
        created = make_profile(client, "Ada", "student")
        assert created["id"] is not None
        assert created["role"] == "student"
        names = [p["name"] for p in client.get("/api/profiles").json()]
        assert "Ada" in names

    def test_rejects_invalid_role(self, client):
        resp = client.post("/api/profiles", json={"name": "Bad", "role": "admin"})
        assert resp.status_code == 400

    def test_rejects_duplicate_name(self, client):
        make_profile(client, "Dupe")
        resp = client.post("/api/profiles", json={"name": "Dupe", "role": "instructor"})
        assert resp.status_code == 409

    def test_delete_profile(self, client):
        created = make_profile(client, "ToDelete")
        assert client.delete(f"/api/profiles/{created['id']}").json() == {"ok": True}
        assert "ToDelete" not in [p["name"] for p in client.get("/api/profiles").json()]


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------

class TestExercises:
    def test_create_and_read_exercise(self, client):
        created = client.post("/api/exercises", json=exercise_payload()).json()
        assert created["id"] is not None
        fetched = client.get(f"/api/exercises/{created['id']}").json()
        assert fetched["title"] == "Ends with 'ab'"
        assert fetched["automaton_type"] == "DFA"

    def test_list_filters_by_type_and_difficulty(self, client):
        client.post("/api/exercises", json=exercise_payload(title="A", automaton_type="DFA", difficulty="beginner"))
        client.post("/api/exercises", json=exercise_payload(title="B", automaton_type="NFA", difficulty="advanced"))

        dfa_only = client.get("/api/exercises", params={"automaton_type": "DFA"}).json()
        assert all(e["automaton_type"] == "DFA" for e in dfa_only)

        advanced_only = client.get("/api/exercises", params={"difficulty": "advanced"}).json()
        assert all(e["difficulty"] == "advanced" for e in advanced_only)

    def test_update_exercise(self, client):
        created = client.post("/api/exercises", json=exercise_payload()).json()
        updated = client.put(f"/api/exercises/{created['id']}", json={"title": "New title"}).json()
        assert updated["title"] == "New title"
        assert updated["automaton_type"] == "DFA"  # untouched

    def test_delete_exercise(self, client):
        created = client.post("/api/exercises", json=exercise_payload()).json()
        assert client.delete(f"/api/exercises/{created['id']}").json() == {"ok": True}
        assert client.get(f"/api/exercises/{created['id']}").status_code == 404

    def test_missing_exercise_returns_404(self, client):
        assert client.get("/api/exercises/999999").status_code == 404
        assert client.put("/api/exercises/999999", json={"title": "x"}).status_code == 404
        assert client.delete("/api/exercises/999999").status_code == 404


# ---------------------------------------------------------------------------
# Attempts
# ---------------------------------------------------------------------------

class TestAttempts:
    def _setup(self, client, name="Grace"):
        profile = make_profile(client, name)
        exercise = client.post("/api/exercises", json=exercise_payload()).json()
        return profile, exercise

    def attempt_payload(self, exercise_id, profile_id, attempt_number=1, passed=True):
        return {
            "exercise_id": exercise_id,
            "profile_id": profile_id,
            "attempt_number": attempt_number,
            "submitted_nodes_json": "[]",
            "submitted_edges_json": "[]",
            "passed": passed,
            "score": 1.0 if passed else 0.5,
            "counterexample": None if passed else "ba",
            "message": "ok",
        }

    def test_create_attempt_and_list(self, client):
        profile, exercise = self._setup(client, "Grace-list")
        created = client.post(
            "/api/attempts", json=self.attempt_payload(exercise["id"], profile["id"])
        ).json()
        assert created["id"] is not None
        assert created["passed"] is True

        listed = client.get(
            "/api/attempts", params={"exercise_id": exercise["id"], "profile_id": profile["id"]}
        ).json()
        assert len(listed) == 1

    def test_attempt_requires_existing_exercise_and_profile(self, client):
        profile, exercise = self._setup(client, "Grace-404")
        bad_exercise = client.post(
            "/api/attempts", json=self.attempt_payload(999999, profile["id"])
        )
        assert bad_exercise.status_code == 404

        bad_profile = client.post(
            "/api/attempts", json=self.attempt_payload(exercise["id"], 999999)
        )
        assert bad_profile.status_code == 404

    def test_max_attempts_enforced(self, client):
        profile, exercise = self._setup(client, "Grace-max")
        client.put(f"/api/exercises/{exercise['id']}", json={"max_attempts": 1})

        first = client.post(
            "/api/attempts", json=self.attempt_payload(exercise["id"], profile["id"], 1, passed=False)
        )
        assert first.status_code == 200

        second = client.post(
            "/api/attempts", json=self.attempt_payload(exercise["id"], profile["id"], 2, passed=True)
        )
        assert second.status_code == 403

    def test_attempt_stats(self, client):
        profile, exercise = self._setup(client, "Grace-stats")
        client.post("/api/attempts", json=self.attempt_payload(exercise["id"], profile["id"], 1, passed=False))
        client.post("/api/attempts", json=self.attempt_payload(exercise["id"], profile["id"], 2, passed=True))

        stats = client.get("/api/attempts/stats", params={"profile_id": profile["id"]}).json()
        assert stats["attempts_total"] == 2
        assert stats["exercises_attempted"] == 1
        assert stats["exercises_passed"] == 1


# ---------------------------------------------------------------------------
# Lesson paths, steps, and progress
# ---------------------------------------------------------------------------

class TestLessonPaths:
    def test_create_path_with_steps_and_read_back_in_order(self, client):
        path = client.post(
            "/api/lesson-paths", json={"title": "Regular Languages 101", "description": "From DFA to regex."}
        ).json()
        exercise = client.post("/api/exercises", json=exercise_payload()).json()

        client.post(
            f"/api/lesson-paths/{path['id']}/steps",
            json={
                "lesson_path_id": path["id"],
                "position": 1,
                "step_type": "topic",
                "title": "NFA",
                "description": "Non-deterministic automata",
            },
        )
        client.post(
            f"/api/lesson-paths/{path['id']}/steps",
            json={
                "lesson_path_id": path["id"],
                "position": 0,
                "step_type": "exercise",
                "title": "DFA",
                "description": "",
                "exercise_id": exercise["id"],
            },
        )

        steps = client.get(f"/api/lesson-paths/{path['id']}/steps").json()
        assert [s["title"] for s in steps] == ["DFA", "NFA"]
        assert steps[0]["exercise_id"] == exercise["id"]

    def test_step_lesson_path_id_mismatch_rejected(self, client):
        path = client.post("/api/lesson-paths", json={"title": "P", "description": ""}).json()
        resp = client.post(
            f"/api/lesson-paths/{path['id']}/steps",
            json={"lesson_path_id": path["id"] + 999, "position": 0, "step_type": "topic", "title": "X"},
        )
        assert resp.status_code == 400

    def test_delete_path_cascades_steps(self, client):
        path = client.post("/api/lesson-paths", json={"title": "P2", "description": ""}).json()
        step = client.post(
            f"/api/lesson-paths/{path['id']}/steps",
            json={"lesson_path_id": path["id"], "position": 0, "step_type": "topic", "title": "X"},
        ).json()
        client.delete(f"/api/lesson-paths/{path['id']}")
        assert client.get(f"/api/lesson-paths/{path['id']}").status_code == 404
        assert client.delete(f"/api/lesson-paths/{path['id']}/steps/{step['id']}").status_code == 404

    def test_progress_upsert_creates_then_updates(self, client):
        profile = make_profile(client, "Path-Student")
        path = client.post("/api/lesson-paths", json={"title": "P3", "description": ""}).json()

        created = client.put(
            f"/api/lesson-paths/{path['id']}/progress",
            json={
                "lesson_path_id": path["id"],
                "profile_id": profile["id"],
                "current_step_index": 0,
                "completed_steps_json": "[]",
            },
        ).json()
        assert created["current_step_index"] == 0

        updated = client.put(
            f"/api/lesson-paths/{path['id']}/progress",
            json={
                "lesson_path_id": path["id"],
                "profile_id": profile["id"],
                "current_step_index": 1,
                "completed_steps_json": "[0]",
            },
        ).json()
        assert updated["current_step_index"] == 1
        assert updated["id"] == created["id"]  # same row, upserted

        fetched = client.get(
            f"/api/lesson-paths/{path['id']}/progress", params={"profile_id": profile["id"]}
        ).json()
        assert fetched["completed_steps_json"] == "[0]"

    def test_progress_missing_returns_404(self, client):
        path = client.post("/api/lesson-paths", json={"title": "P4", "description": ""}).json()
        resp = client.get(f"/api/lesson-paths/{path['id']}/progress", params={"profile_id": 999999})
        assert resp.status_code == 404
