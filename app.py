from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import uuid
import csv
import io
from datetime import date, timedelta

app = FastAPI(title="Personal CRM")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.json")

templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


def load_db():
    if not os.path.exists(DB_PATH):
        save_db({"contacts": [], "todos": []})
    db = json.load(open(DB_PATH, "r"))
    if "todos" not in db:
        db["todos"] = []
    return db


def save_db(data):
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2, default=str)


class Contact(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    linkedin: Optional[str] = ""
    company: Optional[str] = ""
    tags: Optional[str] = ""
    category: Optional[str] = "work"
    notes: Optional[str] = ""
    last_contacted: Optional[str] = ""
    next_contact_reminder: Optional[str] = ""
    cadence_days: Optional[int] = None


class Todo(BaseModel):
    title: str
    status: Optional[str] = "todo"  # todo | doing | done


class InteractionEntry(BaseModel):
    note: Optional[str] = ""


class BulkDeleteRequest(BaseModel):
    ids: List[str]


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ── Fixed-path routes before parameterised routes ──────────────────────────

@app.get("/api/contacts/export")
async def export_contacts():
    db = load_db()
    contacts = db["contacts"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "name", "email", "phone", "linkedin", "company", "tags", "category",
        "notes", "last_contacted", "next_contact_reminder",
        "cadence_days", "created_at"
    ])
    for c in contacts:
        writer.writerow([
            c.get("id", ""),
            c.get("name", ""),
            c.get("email", ""),
            c.get("phone", ""),
            c.get("linkedin", ""),
            c.get("company", ""),
            c.get("tags", ""),
            c.get("category", ""),
            c.get("notes", ""),
            c.get("last_contacted", ""),
            c.get("next_contact_reminder", ""),
            c.get("cadence_days", ""),
            c.get("created_at", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"}
    )


@app.post("/api/contacts/import")
async def import_contacts(file: UploadFile = File(...)):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    db = load_db()
    existing_ids = {c["id"] for c in db["contacts"]}
    today_str = date.today().isoformat()

    imported = 0
    skipped = 0
    for row in reader:
        name = (row.get("name") or "").strip()
        if not name:
            skipped += 1
            continue

        # If the CSV has a valid id that already exists, skip
        row_id = (row.get("id") or "").strip()
        if row_id and row_id in existing_ids:
            skipped += 1
            continue

        cadence_raw = row.get("cadence_days", "")
        try:
            cadence = int(cadence_raw) if cadence_raw and cadence_raw.strip() else None
        except ValueError:
            cadence = None

        new_contact = {
            "id": row_id if row_id else str(uuid.uuid4()),
            "name": name,
            "email": (row.get("email") or "").strip(),
            "phone": (row.get("phone") or "").strip(),
            "linkedin": (row.get("linkedin") or "").strip(),
            "company": (row.get("company") or "").strip(),
            "tags": (row.get("tags") or "").strip(),
            "category": (row.get("category") or "work").strip(),
            "notes": (row.get("notes") or "").strip(),
            "last_contacted": (row.get("last_contacted") or "").strip(),
            "next_contact_reminder": (row.get("next_contact_reminder") or "").strip(),
            "cadence_days": cadence,
            "created_at": (row.get("created_at") or today_str).strip(),
            "interactions": [],
        }
        db["contacts"].append(new_contact)
        existing_ids.add(new_contact["id"])
        imported += 1

    save_db(db)
    return {"imported": imported, "skipped": skipped}


@app.post("/api/contacts/bulk-delete")
async def bulk_delete(req: BulkDeleteRequest):
    db = load_db()
    id_set = set(req.ids)
    before = len(db["contacts"])
    db["contacts"] = [c for c in db["contacts"] if c["id"] not in id_set]
    deleted = before - len(db["contacts"])
    save_db(db)
    return {"deleted": deleted}


# ── Standard CRUD ───────────────────────────────────────────────────────────

@app.get("/api/contacts")
async def get_contacts():
    db = load_db()
    return db["contacts"]


@app.post("/api/contacts")
async def create_contact(contact: Contact):
    db = load_db()
    new_contact = contact.dict()
    new_contact["id"] = str(uuid.uuid4())
    new_contact["created_at"] = date.today().isoformat()
    new_contact["interactions"] = []
    db["contacts"].append(new_contact)
    save_db(db)
    return new_contact


@app.put("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, contact: Contact):
    db = load_db()
    for i, c in enumerate(db["contacts"]):
        if c["id"] == contact_id:
            updated = contact.dict()
            updated["id"] = contact_id
            # Preserve fields not in the Contact model
            updated["created_at"] = c.get("created_at", date.today().isoformat())
            updated["interactions"] = c.get("interactions", [])
            db["contacts"][i] = updated
            save_db(db)
            return updated
    raise HTTPException(status_code=404, detail="Contact not found")


@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    db = load_db()
    original_len = len(db["contacts"])
    db["contacts"] = [c for c in db["contacts"] if c["id"] != contact_id]
    if len(db["contacts"]) == original_len:
        raise HTTPException(status_code=404, detail="Contact not found")
    save_db(db)
    return {"status": "deleted"}


# ── Interactions ────────────────────────────────────────────────────────────

@app.post("/api/contacts/{contact_id}/interactions")
async def add_interaction(contact_id: str, entry: InteractionEntry):
    db = load_db()
    today_str = date.today().isoformat()
    for c in db["contacts"]:
        if c["id"] == contact_id:
            if "interactions" not in c:
                c["interactions"] = []
            interaction = {
                "id": str(uuid.uuid4()),
                "date": today_str,
                "note": (entry.note or "").strip(),
            }
            c["interactions"].append(interaction)
            c["last_contacted"] = today_str
            # Auto-advance reminder if cadence_days is set
            cadence = c.get("cadence_days")
            if cadence:
                try:
                    next_date = (date.today() + timedelta(days=int(cadence))).isoformat()
                    c["next_contact_reminder"] = next_date
                except (ValueError, TypeError):
                    pass
            save_db(db)
            return c
    raise HTTPException(status_code=404, detail="Contact not found")


@app.delete("/api/contacts/{contact_id}/interactions/{interaction_id}")
async def delete_interaction(contact_id: str, interaction_id: str):
    db = load_db()
    for c in db["contacts"]:
        if c["id"] == contact_id:
            before = len(c.get("interactions", []))
            c["interactions"] = [
                i for i in c.get("interactions", []) if i["id"] != interaction_id
            ]
            if len(c["interactions"]) == before:
                raise HTTPException(status_code=404, detail="Interaction not found")
            save_db(db)
            return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Contact not found")


# ── Stats ───────────────────────────────────────────────────────────────────

@app.get("/api/stats")
async def get_stats():
    db = load_db()
    contacts = db["contacts"]
    today_str = date.today().isoformat()

    total = len(contacts)
    work = sum(1 for c in contacts if c.get("category") == "work")
    personal = sum(1 for c in contacts if c.get("category") == "personal")

    due_mild = 0
    due_moderate = 0
    due_severe = 0
    due_today = 0

    for c in contacts:
        reminder = c.get("next_contact_reminder")
        if not reminder or reminder > today_str:
            continue
        due_today += 1
        try:
            r_date = date.fromisoformat(reminder)
            days_overdue = (date.today() - r_date).days
        except ValueError:
            continue
        if days_overdue <= 7:
            due_mild += 1
        elif days_overdue <= 28:
            due_moderate += 1
        else:
            due_severe += 1

    return {
        "total": total,
        "work": work,
        "personal": personal,
        "due_today": due_today,
        "due_mild": due_mild,
        "due_moderate": due_moderate,
        "due_severe": due_severe,
    }


# ── Todos ────────────────────────────────────────────────────────────────────

@app.get("/api/todos")
async def get_todos():
    db = load_db()
    return db["todos"]


@app.post("/api/todos")
async def create_todo(todo: Todo):
    db = load_db()
    new_todo = todo.dict()
    new_todo["id"] = str(uuid.uuid4())
    new_todo["created_at"] = date.today().isoformat()
    db["todos"].append(new_todo)
    save_db(db)
    return new_todo


@app.put("/api/todos/{todo_id}")
async def update_todo(todo_id: str, todo: Todo):
    db = load_db()
    for i, t in enumerate(db["todos"]):
        if t["id"] == todo_id:
            updated = todo.dict()
            updated["id"] = todo_id
            updated["created_at"] = t.get("created_at", date.today().isoformat())
            db["todos"][i] = updated
            save_db(db)
            return updated
    raise HTTPException(status_code=404, detail="Todo not found")


@app.delete("/api/todos/{todo_id}")
async def delete_todo(todo_id: str):
    db = load_db()
    original_len = len(db["todos"])
    db["todos"] = [t for t in db["todos"] if t["id"] != todo_id]
    if len(db["todos"]) == original_len:
        raise HTTPException(status_code=404, detail="Todo not found")
    save_db(db)
    return {"status": "deleted"}
