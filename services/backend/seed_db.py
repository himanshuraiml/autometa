import sqlite3
import json
from datetime import datetime

conn = sqlite3.connect('autometa.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='project'")
table_exists = cursor.fetchone()

if table_exists:
    cursor.execute("SELECT id FROM project WHERE name = 'Ends with ab'")
    exists = cursor.fetchone()

    if not exists:
        nodes = [
          {
            "id": "q0",
            "type": "state",
            "position": {"x": 150, "y": 250},
            "data": {
              "label": "q0",
              "isStart": True,
              "isAccept": False,
              "isActive": False,
              "scale": 1,
              "glow": 0
            }
          },
          {
            "id": "q1",
            "type": "state",
            "position": {"x": 350, "y": 250},
            "data": {
              "label": "q1",
              "isStart": False,
              "isAccept": False,
              "isActive": False,
              "scale": 1,
              "glow": 0
            }
          },
          {
            "id": "q2",
            "type": "state",
            "position": {"x": 550, "y": 250},
            "data": {
              "label": "q2",
              "isStart": False,
              "isAccept": True,
              "isActive": False,
              "scale": 1,
              "glow": 0
            }
          }
        ]

        edges = [
          {"id": "e-q0-q1", "source": "q0", "target": "q1", "type": "transition", "data": {"label": "a"}},
          {"id": "e-q0-q0", "source": "q0", "target": "q0", "type": "transition", "data": {"label": "b"}},
          {"id": "e-q1-q1", "source": "q1", "target": "q1", "type": "transition", "data": {"label": "a"}},
          {"id": "e-q1-q2", "source": "q1", "target": "q2", "type": "transition", "data": {"label": "b"}},
          {"id": "e-q2-q1", "source": "q2", "target": "q1", "type": "transition", "data": {"label": "a"}},
          {"id": "e-q2-q0", "source": "q2", "target": "q0", "type": "transition", "data": {"label": "b"}}
        ]

        cursor.execute(
            "INSERT INTO project (name, automaton_type, nodes_json, edges_json, node_counter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                'Ends with ab',
                'DFA',
                json.dumps(nodes),
                json.dumps(edges),
                3,
                datetime.now().isoformat(),
                datetime.now().isoformat()
            )
        )
        conn.commit()
        print("Database seeded with 'Ends with ab' DFA!")
    else:
        print("Project already seeded.")
else:
    print("Project table does not exist. Verify the FastAPI server has initialized the DB.")

conn.close()
