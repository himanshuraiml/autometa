import pytest
from fastapi.testclient import TestClient

import main
from config import settings
from main import LessonResponse, app


@pytest.fixture()
def client():
    # Context manager runs the lifespan handler (init_db) on entry.
    with TestClient(app) as c:
        yield c


def project_payload(name="Test DFA"):
    return {
        "name": name,
        "automaton_type": "DFA",
        "nodes_json": "[]",
        "edges_json": "[]",
        "node_counter": 0,
        "metadata_json": '{"alphabet":["0","1"]}',
    }


# ---------------------------------------------------------------------------
# Health & auth middleware
# ---------------------------------------------------------------------------

class TestHealthAndAuth:
    def test_health_reports_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["database"] == "ok"

    def test_api_open_when_auth_disabled(self, client):
        assert client.get("/api/projects").status_code == 200

    def test_api_rejects_missing_token(self, client, monkeypatch):
        monkeypatch.setattr(settings, "auth_token", "secret-token")
        resp = client.get("/api/projects")
        assert resp.status_code == 401
        assert resp.json() == {"detail": "Unauthorized"}

    def test_api_rejects_wrong_token(self, client, monkeypatch):
        monkeypatch.setattr(settings, "auth_token", "secret-token")
        resp = client.get("/api/projects", headers={"Authorization": "Bearer nope"})
        assert resp.status_code == 401

    def test_api_accepts_correct_token(self, client, monkeypatch):
        monkeypatch.setattr(settings, "auth_token", "secret-token")
        resp = client.get("/api/projects", headers={"Authorization": "Bearer secret-token"})
        assert resp.status_code == 200

    def test_health_stays_open_with_auth_enabled(self, client, monkeypatch):
        monkeypatch.setattr(settings, "auth_token", "secret-token")
        assert client.get("/health").status_code == 200


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

class TestProjectCrud:
    def test_create_and_read_project(self, client):
        created = client.post("/api/projects", json=project_payload("CRUD-A")).json()
        assert created["id"] is not None
        assert created["name"] == "CRUD-A"

        fetched = client.get(f"/api/projects/{created['id']}").json()
        assert fetched["name"] == "CRUD-A"
        assert fetched["automaton_type"] == "DFA"
        assert fetched["metadata_json"] == '{"alphabet":["0","1"]}'

    def test_list_returns_created_projects(self, client):
        client.post("/api/projects", json=project_payload("CRUD-list"))
        names = [p["name"] for p in client.get("/api/projects").json()]
        assert "CRUD-list" in names

    def test_update_project_changes_fields_and_timestamp(self, client):
        created = client.post("/api/projects", json=project_payload("CRUD-upd")).json()
        updated = client.put(
            f"/api/projects/{created['id']}", json={"name": "CRUD-upd-2"}
        ).json()
        assert updated["name"] == "CRUD-upd-2"
        assert updated["automaton_type"] == "DFA"  # untouched field preserved
        assert updated["updated_at"] >= created["updated_at"]

    def test_delete_project(self, client):
        created = client.post("/api/projects", json=project_payload("CRUD-del")).json()
        assert client.delete(f"/api/projects/{created['id']}").json() == {"ok": True}
        assert client.get(f"/api/projects/{created['id']}").status_code == 404

    def test_missing_project_returns_404(self, client):
        assert client.get("/api/projects/999999").status_code == 404
        assert client.put("/api/projects/999999", json={"name": "x"}).status_code == 404
        assert client.delete("/api/projects/999999").status_code == 404

    def test_create_rejects_invalid_payload(self, client):
        bad = project_payload()
        bad["name"] = ""  # violates min_length=1
        assert client.post("/api/projects", json=bad).status_code == 422

    def test_list_supports_limit_and_offset(self, client):
        for i in range(3):
            client.post("/api/projects", json=project_payload(f"Page-{i}"))

        first_two = client.get("/api/projects", params={"limit": 2}).json()
        assert len(first_two) == 2

        next_page = client.get("/api/projects", params={"limit": 2, "offset": 2}).json()
        assert first_two[0]["id"] not in [p["id"] for p in next_page]

    def test_list_rejects_out_of_range_pagination(self, client):
        assert client.get("/api/projects", params={"limit": 0}).status_code == 422
        assert client.get("/api/projects", params={"limit": 501}).status_code == 422
        assert client.get("/api/projects", params={"offset": -1}).status_code == 422


# ---------------------------------------------------------------------------
# Lesson response coercion (loose local-LLM JSON output)
# ---------------------------------------------------------------------------

class TestLessonCoercion:
    def test_list_valued_text_fields_are_joined(self):
        lesson = LessonResponse.model_validate({
            "topic": "DFAs",
            "slides": [{
                "title": ["Part 1", "Part 2"],
                "markdown": ["First paragraph.", "Second paragraph."],
            }],
            "summary": ["One.", "Two."],
        })
        assert lesson.slides[0].title == "Part 1\nPart 2"
        assert lesson.slides[0].markdown == "First paragraph.\nSecond paragraph."
        assert lesson.summary == "One.\nTwo."

    def test_numeric_and_string_diagram_coordinates_coerce(self):
        lesson = LessonResponse.model_validate({
            "topic": "NFAs",
            "slides": [{
                "title": "T",
                "diagram": {
                    "type": "NFA",
                    "nodes": [
                        {"id": "q0", "label": 1, "x": "100", "y": "not-a-number"},
                    ],
                    "edges": [],
                },
            }],
        })
        node = lesson.slides[0].diagram.nodes[0]
        assert node.label == "1"
        assert node.x == 100.0
        assert node.y == 0.0  # unparseable -> safe default

    def test_quiz_options_items_coerced_to_strings(self):
        lesson = LessonResponse.model_validate({
            "topic": "PDAs",
            "slides": [{
                "title": "Quiz",
                "quizQuestion": "How many?",
                "quizOptions": [1, 2, "three"],
                "quizAnswer": 0,
            }],
        })
        assert lesson.slides[0].quizOptions == ["1", "2", "three"]


# ---------------------------------------------------------------------------
# AI endpoints (LLM calls stubbed out)
# ---------------------------------------------------------------------------

class TestAiEndpoints:
    def test_chat_forwards_prompt_and_returns_response(self, client, monkeypatch):
        captured = {}

        async def fake_tutor(prompt, mode="Intermediate", **kwargs):
            captured["prompt"] = prompt
            captured["mode"] = mode
            return "stubbed answer"

        monkeypatch.setattr(main, "generate_tutor_response", fake_tutor)
        resp = client.post("/api/tutor/chat", json={"prompt": "What is a DFA?", "mode": "Beginner"})
        assert resp.status_code == 200
        assert resp.json() == {"response": "stubbed answer"}
        assert captured["prompt"] == "What is a DFA?"
        assert captured["mode"] == "Beginner"

    def test_chat_rejects_empty_prompt(self, client):
        assert client.post("/api/tutor/chat", json={"prompt": ""}).status_code == 422

    def test_grade_embeds_simulation_runs_in_prompt(self, client, monkeypatch):
        captured = {}

        async def fake_tutor(prompt, mode="Intermediate", **kwargs):
            captured["prompt"] = prompt
            return "graded"

        monkeypatch.setattr(main, "generate_tutor_response", fake_tutor)
        resp = client.post("/api/tutor/grade", json={
            "description": "Accepts strings ending in b",
            "automaton_type": "DFA",
            "nodes": [{"id": "q0", "label": "q0", "isStart": True, "isAccept": False}],
            "edges": [],
            "alphabet": ["a", "b"],
            "simulation_runs": [
                {"input": "ab", "accepted": True},
                {"input": "ba", "accepted": False},
            ],
        })
        assert resp.status_code == 200
        assert "'ab' -> Accept" in captured["prompt"]
        assert "'ba' -> Reject" in captured["prompt"]
        assert "Accepts strings ending in b" in captured["prompt"]

    def test_lesson_endpoint_validates_and_backfills_request_fields(self, client, monkeypatch):
        async def fake_lesson(**kwargs):
            return {
                "topic": "DFAs",
                "slides": [{"title": "Intro", "markdown": "Hello"}],
                "summary": "Done.",
            }

        monkeypatch.setattr(main, "generate_lesson", fake_lesson)
        resp = client.post("/api/tutor/lesson", json={
            "topic": "DFAs",
            "audience": "testers",
            "include_quizzes": False,
            "generate_narration": False,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["audience"] == "testers"  # backfilled from the request
        assert body["slides"][0]["title"] == "Intro"

    def test_lesson_endpoint_maps_llm_failure_to_502(self, client, monkeypatch):
        async def fake_lesson(**kwargs):
            raise ValueError("Local LLM did not return a parseable lesson JSON object.")

        monkeypatch.setattr(main, "generate_lesson", fake_lesson)
        resp = client.post("/api/tutor/lesson", json={
            "topic": "DFAs", "include_quizzes": True, "generate_narration": True,
        })
        assert resp.status_code == 502
