from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class ProjectBase(SQLModel):
    name: str
    automaton_type: str
    nodes_json: str
    edges_json: str
    node_counter: int

class Project(ProjectBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(SQLModel):
    name: Optional[str] = None
    automaton_type: Optional[str] = None
    nodes_json: Optional[str] = None
    edges_json: Optional[str] = None
    node_counter: Optional[int] = None
