import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from ai import generate_lesson, generate_tutor_response
from config import APP_VERSION, settings
from database import engine, get_session, init_db
from models import (
    Attempt,
    AttemptCreate,
    Comment,
    CommentCreate,
    Exercise,
    ExerciseCreate,
    ExerciseUpdate,
    LessonPath,
    LessonPathCreate,
    LessonPathStep,
    LessonPathStepCreate,
    LessonPathUpdate,
    PathProgress,
    PathProgressUpsert,
    Profile,
    ProfileCreate,
    Project,
    ProjectCreate,
    ProjectUpdate,
    ProjectVersion,
    ProjectVersionCreate,
)

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("autometa.api")

STARTED_AT = time.monotonic()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    logger.info(
        "Autometa backend %s listening on %s:%d (auth %s)",
        APP_VERSION,
        settings.host,
        settings.port,
        "enabled" if settings.auth_token else "disabled",
    )
    yield


app = FastAPI(title="Autometa Backend Services", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def auth_and_request_log(request: Request, call_next):
    start = time.monotonic()

    # /health stays open so the shell can probe readiness before it has
    # delivered the token to the frontend.
    if settings.auth_token and request.url.path.startswith("/api"):
        supplied = request.headers.get("authorization", "")
        expected = f"Bearer {settings.auth_token}"
        if not hmac.compare_digest(supplied, expected):
            logger.warning("%s %s -> 401 (bad or missing token)", request.method, request.url.path)
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    response = await call_next(request)
    elapsed_ms = (time.monotonic() - start) * 1000
    logger.info(
        "%s %s -> %d (%.0fms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, _exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check the backend logs for details."},
    )


@app.get("/health")
def health():
    db_ok = True
    try:
        with Session(engine) as session:
            session.exec(select(Project).limit(1)).first()
    except Exception:
        logger.exception("Health check: database probe failed")
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "version": APP_VERSION,
        "database": "ok" if db_ok else "error",
        "uptime_seconds": round(time.monotonic() - STARTED_AT, 1),
    }


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@app.post("/api/projects", response_model=Project)
def create_project(project: ProjectCreate, session: Session = Depends(get_session)):
    db_project = Project.model_validate(project)
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project


@app.get("/api/projects", response_model=List[Project])
def read_projects(
    visibility: Optional[str] = Query(default=None),
    owner_profile_id: Optional[int] = Query(default=None),
    is_favorite: Optional[bool] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = select(Project)
    if visibility:
        stmt = stmt.where(Project.visibility == visibility)
    if owner_profile_id is not None:
        stmt = stmt.where(Project.owner_profile_id == owner_profile_id)
    if is_favorite is not None:
        stmt = stmt.where(Project.is_favorite == is_favorite)
    stmt = stmt.order_by(Project.updated_at.desc()).limit(limit).offset(offset)
    projects = session.exec(stmt).all()
    if tag:
        # tags_json is a small JSON array; filtering in Python avoids a
        # SQLite JSON extension dependency for what is a light local search.
        projects = [p for p in projects if tag in json.loads(p.tags_json or "[]")]
    return projects


@app.get("/api/projects/{project_id}", response_model=Project)
def read_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.put("/api/projects/{project_id}", response_model=Project)
def update_project(
    project_id: int, update: ProjectUpdate, session: Session = Depends(get_session)
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    changes = update.model_dump(exclude_unset=True, exclude_none=True)
    for field_name, value in changes.items():
        setattr(project, field_name, value)
    project.updated_at = datetime.now(timezone.utc)
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"ok": True}


@app.post("/api/projects/{project_id}/clone", response_model=Project)
def clone_project(
    project_id: int,
    owner_profile_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    source = session.get(Project, project_id)
    if not source:
        raise HTTPException(status_code=404, detail="Project not found")
    clone = Project(
        name=f"{source.name} (copy)",
        automaton_type=source.automaton_type,
        nodes_json=source.nodes_json,
        edges_json=source.edges_json,
        node_counter=source.node_counter,
        metadata_json=source.metadata_json,
        tags_json=source.tags_json,
        visibility="private",
        owner_profile_id=owner_profile_id,
        cloned_from_id=source.id,
    )
    session.add(clone)
    session.commit()
    session.refresh(clone)
    return clone


# ---------------------------------------------------------------------------
# Project versions — explicit snapshots (Save Version / restore), and the
# backbone of the "share package" a project export bundles (see the
# frontend's shareFormat.ts; the backend just stores/returns rows).
# ---------------------------------------------------------------------------

@app.post("/api/projects/{project_id}/versions", response_model=ProjectVersion)
def create_project_version(
    project_id: int, version: ProjectVersionCreate, session: Session = Depends(get_session)
):
    if not session.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if version.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id mismatch")
    db_version = ProjectVersion.model_validate(version)
    session.add(db_version)
    session.commit()
    session.refresh(db_version)
    return db_version


@app.get("/api/projects/{project_id}/versions", response_model=List[ProjectVersion])
def list_project_versions(project_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.created_at.desc())
    ).all()


@app.delete("/api/projects/{project_id}/versions/{version_id}")
def delete_project_version(project_id: int, version_id: int, session: Session = Depends(get_session)):
    version = session.get(ProjectVersion, version_id)
    if not version or version.project_id != project_id:
        raise HTTPException(status_code=404, detail="Version not found")
    session.delete(version)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Comments — teacher feedback on an attempt, or discussion on a shared
# project. Exactly one of project_id/exercise_id/attempt_id is expected.
# ---------------------------------------------------------------------------

@app.post("/api/comments", response_model=Comment)
def create_comment(comment: CommentCreate, session: Session = Depends(get_session)):
    if not session.get(Profile, comment.profile_id):
        raise HTTPException(status_code=404, detail="Profile not found")
    db_comment = Comment.model_validate(comment)
    session.add(db_comment)
    session.commit()
    session.refresh(db_comment)
    return db_comment


@app.get("/api/comments", response_model=List[Comment])
def list_comments(
    project_id: Optional[int] = Query(default=None),
    exercise_id: Optional[int] = Query(default=None),
    attempt_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
):
    stmt = select(Comment)
    if project_id is not None:
        stmt = stmt.where(Comment.project_id == project_id)
    if exercise_id is not None:
        stmt = stmt.where(Comment.exercise_id == exercise_id)
    if attempt_id is not None:
        stmt = stmt.where(Comment.attempt_id == attempt_id)
    return session.exec(stmt.order_by(Comment.created_at)).all()


@app.delete("/api/comments/{comment_id}")
def delete_comment(comment_id: int, session: Session = Depends(get_session)):
    comment = session.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    session.delete(comment)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# AI tutor chat
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    mode: str = "Intermediate"
    context: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=200)
    base_url: Optional[str] = Field(default=None, max_length=2000)


@app.post("/api/tutor/chat")
async def chat_with_tutor(request: ChatRequest):
    response = await generate_tutor_response(
        prompt=request.prompt,
        mode=request.mode,
        context_data=request.context,
        provider=request.provider,
        api_key=request.api_key,
        model=request.model,
        base_url=request.base_url,
    )
    return {"response": response}


# ---------------------------------------------------------------------------
# AI lesson generator
#
# Local models (qwen2.5-coder:7b / llama3.2:1b) only loosely follow the requested
# JSON schema even with format="json" enabled - free-text fields sometimes come
# back as a list of bullet strings or a bare number instead of a string.
# `_coerce_str` normalizes those shapes instead of hard-failing the whole lesson
# on a single stray field.
# ---------------------------------------------------------------------------

def _coerce_str(v: Any) -> Any:
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, list):
        return "\n".join(_coerce_str(x) for x in v)
    return str(v)


def _coerce_float(v: Any) -> Any:
    if v is None or isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


class LessonRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    audience: str = Field(default="first-year students", max_length=200)
    duration: Optional[str] = Field(default=None, max_length=100)
    difficulty: Optional[str] = Field(default=None, max_length=50)
    teaching_style: Optional[str] = Field(default=None, max_length=200)
    include_quizzes: bool = True
    generate_narration: bool = True
    provider: Optional[str] = None
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=200)
    base_url: Optional[str] = Field(default=None, max_length=2000)


class LessonDiagramNode(BaseModel):
    id: str
    label: str
    isStart: bool = False
    isAccept: bool = False
    x: float = 0.0
    y: float = 0.0

    _coerce_label = field_validator("label", mode="before")(_coerce_str)
    _coerce_x = field_validator("x", mode="before")(_coerce_float)
    _coerce_y = field_validator("y", mode="before")(_coerce_float)


class LessonDiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str

    _coerce_label = field_validator("label", mode="before")(_coerce_str)


class LessonDiagram(BaseModel):
    type: str
    nodes: List[LessonDiagramNode]
    edges: List[LessonDiagramEdge]
    exampleInput: Optional[str] = None

    _coerce_example_input = field_validator("exampleInput", mode="before")(_coerce_str)


class LessonSlide(BaseModel):
    title: str
    markdown: str = ""
    narration: Optional[str] = None
    diagram: Optional[LessonDiagram] = None
    quizQuestion: Optional[str] = None
    quizOptions: Optional[List[str]] = None
    quizAnswer: Optional[int] = None

    _coerce_title = field_validator("title", mode="before")(_coerce_str)
    _coerce_markdown = field_validator("markdown", mode="before")(_coerce_str)
    _coerce_narration = field_validator("narration", mode="before")(_coerce_str)
    _coerce_quiz_question = field_validator("quizQuestion", mode="before")(_coerce_str)

    @field_validator("quizOptions", mode="before")
    @classmethod
    def _coerce_quiz_options(cls, v):
        if isinstance(v, list):
            return [_coerce_str(item) for item in v]
        return v


class LessonWorksheetItem(BaseModel):
    question: str
    answer: Optional[str] = None

    _coerce_question = field_validator("question", mode="before")(_coerce_str)
    _coerce_answer = field_validator("answer", mode="before")(_coerce_str)


class LessonResponse(BaseModel):
    topic: str
    audience: str = "first-year students"
    duration: Optional[str] = None
    difficulty: Optional[str] = None
    teachingStyle: Optional[str] = None
    learningObjectives: List[str] = []
    slides: List[LessonSlide]
    summary: str = ""
    worksheet: List[LessonWorksheetItem] = []

    _coerce_topic = field_validator("topic", mode="before")(_coerce_str)
    _coerce_summary = field_validator("summary", mode="before")(_coerce_str)

    @field_validator("learningObjectives", mode="before")
    @classmethod
    def _coerce_learning_objectives(cls, v):
        if isinstance(v, list):
            return [_coerce_str(item) for item in v]
        return v


@app.post("/api/tutor/lesson", response_model=LessonResponse)
async def generate_lesson_endpoint(request: LessonRequest):
    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="Topic must not be empty.")
    try:
        raw_lesson = await generate_lesson(
            topic=request.topic,
            audience=request.audience,
            duration=request.duration,
            difficulty=request.difficulty,
            teaching_style=request.teaching_style,
            include_quizzes=request.include_quizzes,
            generate_narration=request.generate_narration,
            provider=request.provider,
            api_key=request.api_key,
            model=request.model,
            base_url=request.base_url,
        )
        raw_lesson.setdefault("audience", request.audience)
        raw_lesson.setdefault("duration", request.duration)
        raw_lesson.setdefault("difficulty", request.difficulty)
        raw_lesson.setdefault("teachingStyle", request.teaching_style)
        return LessonResponse.model_validate(raw_lesson)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# AI canvas grading
#
# Simulation runs client-side via @autometa/simulation-engine (the single
# source of truth for automaton semantics) and the accept/reject outcomes are
# sent here. The backend only assembles the grading prompt.
# ---------------------------------------------------------------------------

class GradeRequestNode(BaseModel):
    id: str
    label: str
    isStart: bool
    isAccept: bool


class GradeRequestEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str


class SimulationRun(BaseModel):
    input: str = Field(max_length=200)
    accepted: bool


class GradeRequest(BaseModel):
    description: str = Field(min_length=1, max_length=5_000)
    automaton_type: str = Field(max_length=20)
    nodes: List[GradeRequestNode] = Field(max_length=500)
    edges: List[GradeRequestEdge] = Field(max_length=2000)
    alphabet: List[str] = Field(default=[], max_length=100)
    simulation_runs: List[SimulationRun] = Field(default=[], max_length=1000)
    provider: Optional[str] = None
    api_key: Optional[str] = Field(default=None, max_length=500)
    model: Optional[str] = Field(default=None, max_length=200)
    base_url: Optional[str] = Field(default=None, max_length=2000)


@app.post("/api/tutor/grade")
async def grade_automaton(request: GradeRequest):
    if request.simulation_runs:
        runs_str = ", ".join(
            f"'{run.input}' -> {'Accept' if run.accepted else 'Reject'}"
            for run in request.simulation_runs
        )
        simulation_section = (
            f"We ran a simulation check on strings over the alphabet {request.alphabet} "
            f"(computed by the app's simulation engine):\n{runs_str}\n\n"
        )
        simulation_task = (
            "1. Check if the simulation results match the target language description. "
            "If not, pinpoint which strings are incorrectly accepted or rejected.\n"
        )
    else:
        simulation_section = ""
        simulation_task = (
            "1. Reason about which example strings the automaton accepts or rejects "
            "and whether that matches the target language description.\n"
        )

    prompt = (
        f"You are a friendly computer science AI tutor grading a student's project.\n"
        f"The student designed a {request.automaton_type} to match the following target language description:\n"
        f'"{request.description}"\n\n'
        f"Here is the representation of the student's automaton:\n"
        f"- States: {[{'id': n.id, 'label': n.label, 'isStart': n.isStart, 'isAccept': n.isAccept} for n in request.nodes]}\n"
        f"- Transitions: {[{'source': e.source, 'target': e.target, 'label': e.label} for e in request.edges]}\n\n"
        f"{simulation_section}"
        f"Task:\n"
        f"{simulation_task}"
        f"2. Look at the states and transitions to see if there are missing/extra transitions, incorrect start state, or incorrect accept states.\n"
        f"3. Provide a clear, educational, and structured feedback report in markdown format. Use bullet points, bold text, or code formatting for readability. Be encouraging!"
    )

    response = await generate_tutor_response(
        prompt=prompt,
        mode="Intermediate",
        provider=request.provider,
        api_key=request.api_key,
        model=request.model,
        base_url=request.base_url,
    )

    return {"response": response}


# ---------------------------------------------------------------------------
# Profiles — lightweight local "accounts" (no passwords; see
# docs/phase-5-7-implementation.md). Every request already passed the shared
# bearer-token check above; profiles just scope progress/authoring data.
# ---------------------------------------------------------------------------

@app.post("/api/profiles", response_model=Profile)
def create_profile(profile: ProfileCreate, session: Session = Depends(get_session)):
    if profile.role not in ("student", "instructor"):
        raise HTTPException(status_code=400, detail="role must be 'student' or 'instructor'")
    existing = session.exec(select(Profile).where(Profile.name == profile.name)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A profile with that name already exists")
    db_profile = Profile.model_validate(profile)
    session.add(db_profile)
    session.commit()
    session.refresh(db_profile)
    return db_profile


@app.get("/api/profiles", response_model=List[Profile])
def list_profiles(session: Session = Depends(get_session)):
    return session.exec(select(Profile).order_by(Profile.created_at)).all()


@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: int, session: Session = Depends(get_session)):
    profile = session.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    session.delete(profile)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Exercises — reference solution + sample-test battery are opaque JSON blobs
# computed client-side (packages/rule-engine), same trust boundary as
# Project.nodes_json/edges_json.
# ---------------------------------------------------------------------------

@app.post("/api/exercises", response_model=Exercise)
def create_exercise(exercise: ExerciseCreate, session: Session = Depends(get_session)):
    db_exercise = Exercise.model_validate(exercise)
    session.add(db_exercise)
    session.commit()
    session.refresh(db_exercise)
    return db_exercise


@app.get("/api/exercises", response_model=List[Exercise])
def list_exercises(
    automaton_type: Optional[str] = Query(default=None),
    difficulty: Optional[str] = Query(default=None),
    created_by: Optional[int] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = select(Exercise)
    if automaton_type:
        stmt = stmt.where(Exercise.automaton_type == automaton_type)
    if difficulty:
        stmt = stmt.where(Exercise.difficulty == difficulty)
    if created_by is not None:
        stmt = stmt.where(Exercise.created_by == created_by)
    stmt = stmt.order_by(Exercise.created_at.desc()).limit(limit).offset(offset)
    return session.exec(stmt).all()


@app.get("/api/exercises/{exercise_id}", response_model=Exercise)
def read_exercise(exercise_id: int, session: Session = Depends(get_session)):
    exercise = session.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise


@app.put("/api/exercises/{exercise_id}", response_model=Exercise)
def update_exercise(
    exercise_id: int, update: ExerciseUpdate, session: Session = Depends(get_session)
):
    exercise = session.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    changes = update.model_dump(exclude_unset=True, exclude_none=True)
    for field_name, value in changes.items():
        setattr(exercise, field_name, value)
    exercise.updated_at = datetime.now(timezone.utc)
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return exercise


@app.delete("/api/exercises/{exercise_id}")
def delete_exercise(exercise_id: int, session: Session = Depends(get_session)):
    exercise = session.get(Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    session.delete(exercise)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Attempts — grading already happened client-side
# (packages/rule-engine/src/grading.ts); this just persists the outcome.
# ---------------------------------------------------------------------------

@app.post("/api/attempts", response_model=Attempt)
def create_attempt(attempt: AttemptCreate, session: Session = Depends(get_session)):
    exercise = session.get(Exercise, attempt.exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not session.get(Profile, attempt.profile_id):
        raise HTTPException(status_code=404, detail="Profile not found")
    if exercise.max_attempts is not None:
        prior_attempts = session.exec(
            select(Attempt).where(
                Attempt.exercise_id == attempt.exercise_id,
                Attempt.profile_id == attempt.profile_id,
            )
        ).all()
        if len(prior_attempts) >= exercise.max_attempts:
            raise HTTPException(status_code=403, detail="Maximum attempts reached for this exercise")
    db_attempt = Attempt.model_validate(attempt)
    session.add(db_attempt)
    session.commit()
    session.refresh(db_attempt)
    return db_attempt


@app.get("/api/attempts", response_model=List[Attempt])
def list_attempts(
    exercise_id: Optional[int] = Query(default=None),
    profile_id: Optional[int] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
):
    stmt = select(Attempt)
    if exercise_id is not None:
        stmt = stmt.where(Attempt.exercise_id == exercise_id)
    if profile_id is not None:
        stmt = stmt.where(Attempt.profile_id == profile_id)
    stmt = stmt.order_by(Attempt.created_at.desc()).limit(limit).offset(offset)
    return session.exec(stmt).all()


@app.get("/api/attempts/stats")
def attempt_stats(profile_id: int = Query(...), session: Session = Depends(get_session)):
    attempts = session.exec(select(Attempt).where(Attempt.profile_id == profile_id)).all()
    exercises_attempted = {a.exercise_id for a in attempts}
    exercises_passed = {a.exercise_id for a in attempts if a.passed}
    return {
        "attempts_total": len(attempts),
        "exercises_attempted": len(exercises_attempted),
        "exercises_passed": len(exercises_passed),
    }


# ---------------------------------------------------------------------------
# Lesson paths
# ---------------------------------------------------------------------------

@app.post("/api/lesson-paths", response_model=LessonPath)
def create_lesson_path(path: LessonPathCreate, session: Session = Depends(get_session)):
    db_path = LessonPath.model_validate(path)
    session.add(db_path)
    session.commit()
    session.refresh(db_path)
    return db_path


@app.get("/api/lesson-paths", response_model=List[LessonPath])
def list_lesson_paths(session: Session = Depends(get_session)):
    return session.exec(select(LessonPath).order_by(LessonPath.updated_at.desc())).all()


@app.get("/api/lesson-paths/{path_id}", response_model=LessonPath)
def read_lesson_path(path_id: int, session: Session = Depends(get_session)):
    path = session.get(LessonPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Lesson path not found")
    return path


@app.put("/api/lesson-paths/{path_id}", response_model=LessonPath)
def update_lesson_path(
    path_id: int, update: LessonPathUpdate, session: Session = Depends(get_session)
):
    path = session.get(LessonPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Lesson path not found")
    changes = update.model_dump(exclude_unset=True, exclude_none=True)
    for field_name, value in changes.items():
        setattr(path, field_name, value)
    path.updated_at = datetime.now(timezone.utc)
    session.add(path)
    session.commit()
    session.refresh(path)
    return path


@app.delete("/api/lesson-paths/{path_id}")
def delete_lesson_path(path_id: int, session: Session = Depends(get_session)):
    path = session.get(LessonPath, path_id)
    if not path:
        raise HTTPException(status_code=404, detail="Lesson path not found")
    for step in session.exec(
        select(LessonPathStep).where(LessonPathStep.lesson_path_id == path_id)
    ).all():
        session.delete(step)
    session.delete(path)
    session.commit()
    return {"ok": True}


@app.post("/api/lesson-paths/{path_id}/steps", response_model=LessonPathStep)
def create_lesson_path_step(
    path_id: int, step: LessonPathStepCreate, session: Session = Depends(get_session)
):
    if not session.get(LessonPath, path_id):
        raise HTTPException(status_code=404, detail="Lesson path not found")
    if step.lesson_path_id != path_id:
        raise HTTPException(status_code=400, detail="lesson_path_id mismatch")
    db_step = LessonPathStep.model_validate(step)
    session.add(db_step)
    session.commit()
    session.refresh(db_step)
    return db_step


@app.get("/api/lesson-paths/{path_id}/steps", response_model=List[LessonPathStep])
def list_lesson_path_steps(path_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(LessonPathStep)
        .where(LessonPathStep.lesson_path_id == path_id)
        .order_by(LessonPathStep.position)
    ).all()


@app.delete("/api/lesson-paths/{path_id}/steps/{step_id}")
def delete_lesson_path_step(path_id: int, step_id: int, session: Session = Depends(get_session)):
    step = session.get(LessonPathStep, step_id)
    if not step or step.lesson_path_id != path_id:
        raise HTTPException(status_code=404, detail="Step not found")
    session.delete(step)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Path progress — one row per (lesson_path, profile), upserted by the API.
# ---------------------------------------------------------------------------

@app.put("/api/lesson-paths/{path_id}/progress", response_model=PathProgress)
def upsert_path_progress(
    path_id: int, progress: PathProgressUpsert, session: Session = Depends(get_session)
):
    if progress.lesson_path_id != path_id:
        raise HTTPException(status_code=400, detail="lesson_path_id mismatch")
    existing = session.exec(
        select(PathProgress).where(
            PathProgress.lesson_path_id == path_id,
            PathProgress.profile_id == progress.profile_id,
        )
    ).first()
    if existing:
        existing.current_step_index = progress.current_step_index
        existing.completed_steps_json = progress.completed_steps_json
        existing.updated_at = datetime.now(timezone.utc)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    db_progress = PathProgress.model_validate(progress)
    session.add(db_progress)
    session.commit()
    session.refresh(db_progress)
    return db_progress


@app.get("/api/lesson-paths/{path_id}/progress", response_model=PathProgress)
def read_path_progress(
    path_id: int, profile_id: int = Query(...), session: Session = Depends(get_session)
):
    progress = session.exec(
        select(PathProgress).where(
            PathProgress.lesson_path_id == path_id,
            PathProgress.profile_id == profile_id,
        )
    ).first()
    if not progress:
        raise HTTPException(status_code=404, detail="No progress recorded yet")
    return progress


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )
