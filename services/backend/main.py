from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, field_validator

from database import create_db_and_tables, get_session
from models import Project, ProjectCreate
from ai import generate_tutor_response, generate_lesson

app = FastAPI(title="Autometa Backend Services")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# Project Endpoints
@app.post("/api/projects", response_model=Project)
def create_project(project: ProjectCreate, session: Session = Depends(get_session)):
    db_project = Project.model_validate(project)
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project

@app.get("/api/projects", response_model=List[Project])
def read_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(Project)).all()
    return projects

@app.get("/api/projects/{project_id}", response_model=Project)
def read_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"ok": True}

# AI Tutor Request Models
class ChatRequest(BaseModel):
    prompt: str
    mode: str = "Intermediate"
    context: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None

@app.post("/api/tutor/chat")
async def chat_with_tutor(request: ChatRequest):
    response = await generate_tutor_response(
        prompt=request.prompt,
        mode=request.mode,
        context_data=request.context,
        provider=request.provider,
        api_key=request.api_key
    )
    return {"response": response}

# AI Lesson Generator Models
#
# Local models (qwen2.5-coder:7b / llama3.2:1b) only loosely follow the requested JSON
# schema even with format="json" enabled - free-text fields sometimes come back as a
# list of bullet strings or a bare number instead of a string. `_coerce_str` normalizes
# those shapes instead of hard-failing the whole lesson on a single stray field.
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
    topic: str
    audience: str = "first-year students"
    provider: Optional[str] = None
    api_key: Optional[str] = None

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
    slides: List[LessonSlide]
    summary: str = ""
    worksheet: List[LessonWorksheetItem] = []

    _coerce_topic = field_validator("topic", mode="before")(_coerce_str)
    _coerce_summary = field_validator("summary", mode="before")(_coerce_str)

@app.post("/api/tutor/lesson", response_model=LessonResponse)
async def generate_lesson_endpoint(request: LessonRequest):
    if not request.topic.strip():
        raise HTTPException(status_code=400, detail="Topic must not be empty.")
    try:
        raw_lesson = await generate_lesson(
            topic=request.topic,
            audience=request.audience,
            provider=request.provider,
            api_key=request.api_key
        )
        return LessonResponse.model_validate(raw_lesson)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

# AI Canvas Grading Models
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

class GradeRequest(BaseModel):
    description: str
    automaton_type: str
    nodes: List[GradeRequestNode]
    edges: List[GradeRequestEdge]
    provider: Optional[str] = None
    api_key: Optional[str] = None

# Epsilon transitions helper & simulator
def simulate_automaton(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], input_string: str, is_dfa: bool) -> bool:
    start_states = [n["id"] for n in nodes if n.get("isStart")]
    if not start_states:
        return False
        
    current_states = set(start_states)
    
    def get_epsilon_closure(states):
        closure = set(states)
        queue = list(states)
        while queue:
            curr = queue.pop(0)
            for e in edges:
                if e["source"] == curr:
                    syms = [s.strip().lower() for s in e["label"].split(",")]
                    if any(s in ["", "ε", "epsilon", "λ", "lambda"] for s in syms):
                        target = e["target"]
                        if target not in closure:
                            closure.add(target)
                            queue.append(target)
        return closure

    current_states = get_epsilon_closure(current_states)
    
    for symbol in input_string:
        next_states = set()
        for state in current_states:
            for e in edges:
                if e["source"] == state:
                    syms = [s.strip() for s in e["label"].split(",")]
                    if symbol in syms:
                        next_states.add(e["target"])
        current_states = get_epsilon_closure(next_states)
        if not current_states:
            break
            
    accept_states = {n["id"] for n in nodes if n.get("isAccept")}
    return len(current_states.intersection(accept_states)) > 0

def get_alphabet(edges: List[GradeRequestEdge]) -> List[str]:
    chars = set()
    for e in edges:
        label = e.label or ""
        for part in label.split(","):
            p = part.strip()
            if p and p not in ["ε", "epsilon", "λ", "lambda"]:
                for char in p:
                    chars.add(char)
    if not chars:
        return ["0", "1"]
    return sorted(list(chars))

def generate_test_strings(alphabet: List[str]) -> List[str]:
    import itertools
    test_strings = [""]
    for length in range(1, 4):
        for p in itertools.product(alphabet, repeat=length):
            test_strings.append("".join(p))
    return test_strings

@app.post("/api/tutor/grade")
async def grade_automaton(request: GradeRequest):
    nodes_list = [{"id": n.id, "label": n.label, "isStart": n.isStart, "isAccept": n.isAccept} for n in request.nodes]
    edges_list = [{"id": e.id, "source": e.source, "target": e.target, "label": e.label} for e in request.edges]
    
    alphabet = get_alphabet(request.edges)
    test_strings = generate_test_strings(alphabet)
    
    simulation_runs = []
    is_dfa = request.automaton_type == "DFA"
    for s in test_strings:
        accepted = simulate_automaton(nodes_list, edges_list, s, is_dfa)
        simulation_runs.append(f"'{s}' -> {'Accept' if accepted else 'Reject'}")
    
    simulation_results_str = ", ".join(simulation_runs)
    
    prompt = (
        f"You are a friendly computer science AI tutor grading a student's project.\n"
        f"The student designed a {request.automaton_type} to match the following target language description:\n"
        f"\"{request.description}\"\n\n"
        f"Here is the representation of the student's automaton:\n"
        f"- States: {[{'id': n.id, 'label': n.label, 'isStart': n.isStart, 'isAccept': n.isAccept} for n in request.nodes]}\n"
        f"- Transitions: {[{'source': e.source, 'target': e.target, 'label': e.label} for e in request.edges]}\n\n"
        f"We ran a simulation check on strings over the alphabet {alphabet} up to length 3:\n"
        f"{simulation_results_str}\n\n"
        f"Task:\n"
        f"1. Check if the simulation results match the target language description. If not, pinpoint which strings are incorrectly accepted or rejected.\n"
        f"2. Look at the states and transitions to see if there are missing/extra transitions, incorrect start state, or incorrect accept states.\n"
        f"3. Provide a clear, educational, and structured feedback report in markdown format. Use bullet points, bold text, or code formatting for readability. Be encouraging!"
    )
    
    response = await generate_tutor_response(
        prompt=prompt,
        mode="Intermediate",
        provider=request.provider,
        api_key=request.api_key
    )
    
    return {"response": response}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
