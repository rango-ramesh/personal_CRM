# Personal CRM

A lightweight, modern personal CRM that runs entirely on your Mac. Track relationships, log interactions, and stay on top of who you need to follow up with — all stored locally in a JSON file that never leaves your machine.

---

## Features

- **Contact management** — add, edit, delete with fields for email, phone, category, notes
- **Interaction log** — record every conversation with optional notes and timestamps
- **Cadence & reminders** — set how often to reach out; next reminder auto-advances when you log a contact
- **Overdue highlighting** — yellow (1–7 days late), orange (8–28 days), red (29+ days)
- **Streak tracking** — see how actively you've kept in touch (last 90 days)
- **Search, filter & sort** — by name, category, date, or overdue status
- **Table & card views** — switch between a compact table and a visual card grid
- **Import / Export** — CSV import with drag-and-drop, full CSV export
- **Keyboard shortcuts** — `N` new contact, `/` search, `Esc` close

---

## Prerequisites

You need **Python 3** installed on your Mac. To check, open the Terminal app and run:

```
python3 --version
```

If you see a version number (e.g. `Python 3.11.4`) you're good to go. If you get an error, download Python from [python.org](https://www.python.org/downloads/) and install it before continuing.

---

## Setup (step by step)

> **New to the terminal?** Open the Terminal app by pressing `Cmd + Space`, typing `Terminal`, and pressing Enter. Then follow each step below — copy and paste each command exactly.

### 1. Go to the project folder

```bash
cd ~/Documents/personal_CRM
```

### 2. Create a virtual environment

This keeps the app's dependencies isolated from the rest of your Mac:

```bash
python3 -m venv .venv
```

### 3. Activate the virtual environment

```bash
source .venv/bin/activate
```

You'll see `(.venv)` appear at the start of your terminal prompt. You need to do this step each time you open a new terminal window.

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

This only needs to be done once.

### 5. Start the app

```bash
uvicorn app:app --reload
```

### 6. Open in your browser

Visit: **http://localhost:8000**

The app is running entirely on your Mac — nothing is sent to the internet.

---

## Running it after the first time

Once set up, every time you want to use the app:

```bash
cd ~/Documents/personal_CRM
source .venv/bin/activate
uvicorn app:app --reload
```

Then open **http://localhost:8000** in your browser.

To stop the app, press `Ctrl + C` in the terminal.

---

## Project structure

```
personal_CRM/
├── app.py              # Backend server (FastAPI)
├── requirements.txt    # Python dependencies
├── database.json       # Your contacts — created automatically, gitignored
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

- All contacts are stored in `database.json` in this folder on your Mac
- This file is listed in `.gitignore` — it will **never** be included if you push this project to GitHub
- Nothing is sent to any server or third party
- To back up your contacts, copy `database.json` somewhere safe, or use the **Export CSV** button in the app

---

## Troubleshooting

**`command not found: python3`**
Install Python from [python.org/downloads](https://www.python.org/downloads/) and reopen your terminal.

**`command not found: uvicorn` or import errors**
Make sure you've activated the virtual environment first (`source .venv/bin/activate`) — you should see `(.venv)` in your prompt.

**The page doesn't load**
Check the terminal for error messages. Make sure the server is still running (you should see `Uvicorn running on http://127.0.0.1:8000`). Try refreshing the page or visiting http://127.0.0.1:8000 instead.

**Port already in use**
Another process is on port 8000. Run on a different port with:
```bash
uvicorn app:app --reload --port 8001
```
Then visit http://localhost:8001.
