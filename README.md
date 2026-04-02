# Nexus

A lightweight personal workspace that runs entirely on your Mac. Track relationships, manage projects, and stay on top of tasks — all stored locally in a single JSON file that never leaves your machine.

---

## Pages

### Projects
Log and track active work across three status states — **Active**, **On Hold**, and **Completed**. Each project card shows a status indicator, optional date range, description, and overlapping contact avatars for collaborators. Cards are sorted by status (Active first).

- Add collaborators by searching your contacts — no freeform entry
- Assign contacts to a project from the contact form
- Tag tasks on the To-Do board with a project for cross-linking

### Contacts
Manage your network with fields for email, phone, LinkedIn, company, tags, notes, and cadence.

- **Interaction log** — record conversations with optional notes and timestamps
- **Cadence & reminders** — next reminder auto-advances when you log an interaction
- **Overdue highlighting** — yellow (1–7 days late), orange (8–28 days), red (29+ days)
- **Snooze** — push a reminder 1 week forward without logging a fake interaction
- **Project tag** — assign a contact to a project; shown as a badge in the table
- **CRM → To-Do sync** — overdue contacts auto-appear as tasks on the board; when marked done they move to the Complete column rather than disappearing

### To-Do
A kanban board with three columns: **To Do**, **Active**, **Complete**.

- Drag cards between columns or reorder within a column
- **Edit button** on each card — change the title and assign a project inline
- **Project badge** — cards tagged to a project show a purple label
- **CRM badge** — tasks auto-created from overdue contacts show a blue CRM label
- Archive a column's cards in one click (hover the column header)

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `N` | New contact / task / project (context-aware) |
| `/` | Jump to search |
| `Esc` | Close any open panel or modal |

---

## Prerequisites

You need **Python 3** installed on your Mac. To check:

```bash
python3 --version
```

If you see a version number (e.g. `Python 3.11.4`) you're good. If not, download it from [python.org](https://www.python.org/downloads/).

---

## Setup

> **New to the terminal?** Open Terminal with `Cmd + Space` → type `Terminal` → press Enter.

### 1. Go to the project folder

Navigate to wherever you've saved this folder, e.g.:

```bash
cd path/to/nexus
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
```

### 3. Activate it

```bash
source .venv/bin/activate
```

You'll see `(.venv)` at the start of your prompt. Repeat this step each time you open a new terminal window.

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

One-time only.

### 5. Start the app

```bash
uvicorn app:app --reload
```

### 6. Open in your browser

**http://localhost:8000**

Everything runs on your Mac — nothing is sent to the internet.

---

## Running after first setup

```bash
cd path/to/nexus
source .venv/bin/activate
uvicorn app:app --reload
```

Then open **http://localhost:8000**. Press `Ctrl + C` to stop.

---

## Project structure

```
nexus/
├── app.py              # Backend server (FastAPI)
├── requirements.txt    # Python dependencies
├── database.json       # Your data — created automatically, gitignored
├── templates/
│   └── index.html      # App interface
├── static/
│   ├── style.css       # Styling
│   ├── app.js          # Frontend logic
│   └── favicon.svg     # Browser tab icon
└── README.md
```

---

## Your data & privacy

- Everything is stored in `database.json` in this folder
- Listed in `.gitignore` — it will **never** be included if you push to GitHub
- Nothing is sent to any server or third party
- To back up, copy `database.json` somewhere safe or use **Export CSV** from the Contacts page

---

## Troubleshooting

**`command not found: python3`**
Install Python from [python.org/downloads](https://www.python.org/downloads/) and reopen your terminal.

**`command not found: uvicorn` or import errors**
Activate the virtual environment first (`source .venv/bin/activate`) — you should see `(.venv)` in your prompt.

**The page doesn't load**
Check the terminal for errors. Make sure the server is running (you should see `Uvicorn running on http://127.0.0.1:8000`). Try refreshing or visiting http://127.0.0.1:8000 directly.

**Port already in use**
Run on a different port:
```bash
uvicorn app:app --reload --port 8001
```
Then visit http://localhost:8001.

**Navigation or page looks broken after an update**
Hard-refresh your browser (`Cmd + Shift + R`) to clear the cache, then restart the server.
