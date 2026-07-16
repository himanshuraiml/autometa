from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectBase(SQLModel):
    name: str = Field(min_length=1, max_length=200)
    automaton_type: str = Field(max_length=20)
    nodes_json: str
    edges_json: str
    node_counter: int = Field(ge=0)
    metadata_json: str = "{}"
    # Phase 6 — project library / sharing.
    tags_json: str = "[]"
    visibility: str = Field(default="private", max_length=10)  # "private" | "public"
    is_favorite: bool = False
    owner_profile_id: Optional[int] = Field(default=None, foreign_key="profile.id")
    cloned_from_id: Optional[int] = Field(default=None, foreign_key="project.id")


class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    automaton_type: Optional[str] = Field(default=None, max_length=20)
    nodes_json: Optional[str] = None
    edges_json: Optional[str] = None
    node_counter: Optional[int] = Field(default=None, ge=0)
    metadata_json: Optional[str] = None
    tags_json: Optional[str] = None
    visibility: Optional[str] = Field(default=None, max_length=10)
    is_favorite: Optional[bool] = None
    owner_profile_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Project versions — explicit snapshots a user can save and restore, and the
# backbone of the Phase 6 "sharing links" share-package (see main.py).
# ---------------------------------------------------------------------------

class ProjectVersionBase(SQLModel):
    project_id: int = Field(foreign_key="project.id")
    label: str = Field(min_length=1, max_length=200)
    nodes_json: str
    edges_json: str
    node_counter: int = Field(ge=0)


class ProjectVersion(ProjectVersionBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)


class ProjectVersionCreate(ProjectVersionBase):
    pass


# ---------------------------------------------------------------------------
# Profiles — lightweight local "accounts" (no passwords). See the accounts
# decision in docs/phase-5-7-implementation.md: this scopes progress and
# authored content per-profile on one shared local DB, it is not a network
# auth boundary (the existing bearer-token middleware is that boundary).
# ---------------------------------------------------------------------------

class ProfileBase(SQLModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = Field(max_length=20)  # "student" | "instructor"


class Profile(ProfileBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)


class ProfileCreate(ProfileBase):
    pass


# ---------------------------------------------------------------------------
# Exercises — reference solution + a sample-test battery computed from it at
# authoring/generation time. All automaton-semantics fields (nodes/edges,
# regex, CFG rules, alphabet, sample tests) are opaque JSON blobs to the
# backend, same as Project.nodes_json/edges_json: the frontend TypeScript
# engines are the only source of truth for what they mean.
#
# reference_rules_json / submitted_rules_json specifically hold a
# `VersionedGrammar` envelope (`{ schemaVersion, rules, startSymbol }`, see
# packages/rule-engine/src/cfg.ts — GRAMMAR_SCHEMA_VERSION/wrapGrammar/
# migrateGrammar) rather than a bare rules map, so a future breaking change to
# that shape can be migrated by schemaVersion without a backend column change.
# ---------------------------------------------------------------------------

class ExerciseBase(SQLModel):
    title: str = Field(min_length=1, max_length=200)
    automaton_type: str = Field(max_length=20)  # DFA|NFA|Regex|CFG|PDA|TM
    difficulty: str = Field(max_length=20)  # beginner|intermediate|advanced
    learning_objective: str = Field(max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    reference_nodes_json: Optional[str] = None
    reference_edges_json: Optional[str] = None
    reference_regex: Optional[str] = Field(default=None, max_length=1000)
    reference_rules_json: Optional[str] = None
    alphabet_json: str = "[]"
    sample_tests_json: str = "[]"
    hints_json: str = "[]"
    rubric: Optional[str] = Field(default=None, max_length=5000)
    is_ai_generated: bool = False
    created_by: Optional[int] = Field(default=None, foreign_key="profile.id")
    deadline: Optional[datetime] = None
    max_attempts: Optional[int] = Field(default=None, ge=1)


class Exercise(ExerciseBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(SQLModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    difficulty: Optional[str] = Field(default=None, max_length=20)
    learning_objective: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    reference_nodes_json: Optional[str] = None
    reference_edges_json: Optional[str] = None
    reference_regex: Optional[str] = Field(default=None, max_length=1000)
    reference_rules_json: Optional[str] = None
    alphabet_json: Optional[str] = None
    sample_tests_json: Optional[str] = None
    hints_json: Optional[str] = None
    rubric: Optional[str] = Field(default=None, max_length=5000)
    deadline: Optional[datetime] = None
    max_attempts: Optional[int] = Field(default=None, ge=1)


# ---------------------------------------------------------------------------
# Attempts — one row per submission. Grading itself already happened
# client-side (packages/rule-engine/src/grading.ts); this table just persists
# the outcome for progress tracking and gradebook-style views.
# ---------------------------------------------------------------------------

class AttemptBase(SQLModel):
    exercise_id: int = Field(foreign_key="exercise.id")
    profile_id: int = Field(foreign_key="profile.id")
    attempt_number: int = Field(ge=1)
    submitted_nodes_json: Optional[str] = None
    submitted_edges_json: Optional[str] = None
    submitted_regex: Optional[str] = Field(default=None, max_length=1000)
    submitted_rules_json: Optional[str] = None
    passed: bool
    score: float = Field(ge=0, le=1)
    counterexample: Optional[str] = Field(default=None, max_length=500)
    expected: Optional[str] = Field(default=None, max_length=10)
    actual: Optional[str] = Field(default=None, max_length=10)
    message: str = Field(default="", max_length=2000)
    feedback: Optional[str] = Field(default=None, max_length=5000)
    hints_used: int = Field(default=0, ge=0)


class Attempt(AttemptBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)


class AttemptCreate(AttemptBase):
    pass


# ---------------------------------------------------------------------------
# Lesson paths — ordered topic/exercise sequences, e.g. "DFA -> NFA -> subset
# construction -> minimization -> regex".
# ---------------------------------------------------------------------------

class LessonPathBase(SQLModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    created_by: Optional[int] = Field(default=None, foreign_key="profile.id")


class LessonPath(LessonPathBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class LessonPathCreate(LessonPathBase):
    pass


class LessonPathUpdate(SQLModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)


class LessonPathStepBase(SQLModel):
    lesson_path_id: int = Field(foreign_key="lessonpath.id")
    position: int = Field(ge=0)
    step_type: str = Field(max_length=20)  # "topic" | "exercise"
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    exercise_id: Optional[int] = Field(default=None, foreign_key="exercise.id")


class LessonPathStep(LessonPathStepBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)


class LessonPathStepCreate(LessonPathStepBase):
    pass


# ---------------------------------------------------------------------------
# Path progress — one row per (lesson_path, profile); upserted by the API.
# ---------------------------------------------------------------------------

class PathProgressBase(SQLModel):
    lesson_path_id: int = Field(foreign_key="lessonpath.id")
    profile_id: int = Field(foreign_key="profile.id")
    current_step_index: int = Field(default=0, ge=0)
    completed_steps_json: str = "[]"


class PathProgress(PathProgressBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    updated_at: datetime = Field(default_factory=_utcnow)


class PathProgressUpsert(SQLModel):
    lesson_path_id: int
    profile_id: int
    current_step_index: int = Field(default=0, ge=0)
    completed_steps_json: str = "[]"


# ---------------------------------------------------------------------------
# Comments — teacher feedback on an attempt, or discussion on a shared
# project. Exactly one of project_id/exercise_id/attempt_id is expected to be
# set per comment; the backend doesn't enforce that (local-first, trusted
# client), it just stores and filters.
# ---------------------------------------------------------------------------

class CommentBase(SQLModel):
    profile_id: int = Field(foreign_key="profile.id")
    project_id: Optional[int] = Field(default=None, foreign_key="project.id")
    exercise_id: Optional[int] = Field(default=None, foreign_key="exercise.id")
    attempt_id: Optional[int] = Field(default=None, foreign_key="attempt.id")
    body: str = Field(min_length=1, max_length=4000)


class Comment(CommentBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_utcnow)


class CommentCreate(CommentBase):
    pass
