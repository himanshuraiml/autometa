import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def project_payload(name="Proj", **overrides):
    payload = {
        "name": name,
        "automaton_type": "DFA",
        "nodes_json": "[]",
        "edges_json": "[]",
        "node_counter": 0,
    }
    payload.update(overrides)
    return payload


def make_profile(client, name="Teacher", role="instructor"):
    return client.post("/api/profiles", json={"name": name, "role": role}).json()


# ---------------------------------------------------------------------------
# Project library — tags, visibility, favorites, cloning
# ---------------------------------------------------------------------------

class TestProjectLibrary:
    def test_create_project_with_library_fields(self, client):
        profile = make_profile(client, "Owner-A")
        created = client.post(
            "/api/projects",
            json=project_payload(
                "Tagged",
                tags_json='["regex","homework"]',
                visibility="public",
                owner_profile_id=profile["id"],
            ),
        ).json()
        assert created["visibility"] == "public"
        assert created["owner_profile_id"] == profile["id"]

    def test_list_filters_by_visibility_and_owner(self, client):
        profile = make_profile(client, "Owner-B")
        client.post("/api/projects", json=project_payload("Pub", visibility="public", owner_profile_id=profile["id"]))
        client.post("/api/projects", json=project_payload("Priv", visibility="private"))

        public_only = client.get("/api/projects", params={"visibility": "public"}).json()
        assert all(p["visibility"] == "public" for p in public_only)
        assert any(p["name"] == "Pub" for p in public_only)

        owned = client.get("/api/projects", params={"owner_profile_id": profile["id"]}).json()
        assert all(p["owner_profile_id"] == profile["id"] for p in owned)

    def test_list_filters_by_tag(self, client):
        client.post("/api/projects", json=project_payload("Tag-A", tags_json='["nfa","exam"]'))
        client.post("/api/projects", json=project_payload("Tag-B", tags_json='["cfg"]'))

        exam_only = client.get("/api/projects", params={"tag": "exam"}).json()
        assert any(p["name"] == "Tag-A" for p in exam_only)
        assert all("exam" in __import__("json").loads(p["tags_json"]) for p in exam_only)

    def test_favorite_toggle_via_update(self, client):
        created = client.post("/api/projects", json=project_payload("Fav")).json()
        updated = client.put(f"/api/projects/{created['id']}", json={"is_favorite": True}).json()
        assert updated["is_favorite"] is True

        favorites = client.get("/api/projects", params={"is_favorite": True}).json()
        assert any(p["id"] == created["id"] for p in favorites)

    def test_clone_project_creates_independent_copy_with_lineage(self, client):
        profile = make_profile(client, "Cloner")
        source = client.post(
            "/api/projects", json=project_payload("Original", nodes_json='[{"id":"q0"}]')
        ).json()

        cloned = client.post(
            f"/api/projects/{source['id']}/clone", params={"owner_profile_id": profile["id"]}
        ).json()
        assert cloned["id"] != source["id"]
        assert cloned["cloned_from_id"] == source["id"]
        assert cloned["visibility"] == "private"
        assert cloned["nodes_json"] == source["nodes_json"]
        assert cloned["owner_profile_id"] == profile["id"]

        # Editing the clone must not affect the source.
        client.put(f"/api/projects/{cloned['id']}", json={"nodes_json": '[{"id":"q9"}]'})
        refreshed_source = client.get(f"/api/projects/{source['id']}").json()
        assert refreshed_source["nodes_json"] == '[{"id":"q0"}]'

    def test_clone_missing_project_404s(self, client):
        assert client.post("/api/projects/999999/clone").status_code == 404


# ---------------------------------------------------------------------------
# Project versions
# ---------------------------------------------------------------------------

class TestProjectVersions:
    def test_create_and_list_versions_newest_first(self, client):
        project = client.post("/api/projects", json=project_payload("Versioned")).json()

        v1 = client.post(
            f"/api/projects/{project['id']}/versions",
            json={
                "project_id": project["id"],
                "label": "v1",
                "nodes_json": "[]",
                "edges_json": "[]",
                "node_counter": 0,
            },
        ).json()
        v2 = client.post(
            f"/api/projects/{project['id']}/versions",
            json={
                "project_id": project["id"],
                "label": "v2",
                "nodes_json": '[{"id":"q0"}]',
                "edges_json": "[]",
                "node_counter": 1,
            },
        ).json()

        versions = client.get(f"/api/projects/{project['id']}/versions").json()
        assert [v["id"] for v in versions] == [v2["id"], v1["id"]]

    def test_version_project_id_mismatch_rejected(self, client):
        project = client.post("/api/projects", json=project_payload("V-mismatch")).json()
        resp = client.post(
            f"/api/projects/{project['id']}/versions",
            json={
                "project_id": project["id"] + 999,
                "label": "bad",
                "nodes_json": "[]",
                "edges_json": "[]",
                "node_counter": 0,
            },
        )
        assert resp.status_code == 400

    def test_delete_version(self, client):
        project = client.post("/api/projects", json=project_payload("V-del")).json()
        version = client.post(
            f"/api/projects/{project['id']}/versions",
            json={"project_id": project["id"], "label": "v1", "nodes_json": "[]", "edges_json": "[]", "node_counter": 0},
        ).json()
        assert client.delete(f"/api/projects/{project['id']}/versions/{version['id']}").json() == {"ok": True}
        assert client.get(f"/api/projects/{project['id']}/versions").json() == []


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

class TestComments:
    def test_create_and_list_comment_on_project(self, client):
        profile = make_profile(client, "Commenter")
        project = client.post("/api/projects", json=project_payload("Commented")).json()

        created = client.post(
            "/api/comments",
            json={"profile_id": profile["id"], "project_id": project["id"], "body": "Nice automaton!"},
        ).json()
        assert created["id"] is not None

        comments = client.get("/api/comments", params={"project_id": project["id"]}).json()
        assert len(comments) == 1
        assert comments[0]["body"] == "Nice automaton!"

    def test_comment_requires_existing_profile(self, client):
        resp = client.post("/api/comments", json={"profile_id": 999999, "body": "x"})
        assert resp.status_code == 404

    def test_delete_comment(self, client):
        profile = make_profile(client, "Commenter-2")
        created = client.post("/api/comments", json={"profile_id": profile["id"], "body": "temp"}).json()
        assert client.delete(f"/api/comments/{created['id']}").json() == {"ok": True}
        assert client.delete(f"/api/comments/{created['id']}").status_code == 404
