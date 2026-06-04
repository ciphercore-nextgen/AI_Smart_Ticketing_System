# TicketIQ Enterprise

AI-powered enterprise support ticket platform. Tickets are automatically routed to the right agent by AI — no manual department configuration needed.

## How AI Routing Works

When an employee submits a ticket, **GROQ LLaMA 3** reads the content and autonomously decides:

1. **Which department** owns the problem (HR / IT / Finance / Operations)
2. **Which agent role** is best equipped to solve it — based on expertise, not just department rules
3. **Priority level** (critical / high / medium / low) based on urgency signals
4. **Sentiment** and **category** for agent context

**Example:** "The expense management software keeps crashing" → AI routes to **IT** (not Finance) because the problem is technical, even though it involves a financial system.

### Agent Roles

| Role | Handles |
|------|---------|
| **AI Intern** | HR — leave, payslips, policies, onboarding |
| **IT Support Technician** | IT (hardware/software/network) + Finance (expenses/payroll/invoices) |
| **Junior Operations** | Operations — facilities, maintenance, supplies, travel |

---

## Quick Start (VS Code)

### 1. Clone / Open

```bash
# Open the workspace file for the best VS Code experience
code ticketiq.code-workspace
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set your Groq API key
# Edit backend/.env and paste your key:
# GROQ_API_KEY=gsk_your_actual_key_here
# Get a free key at https://console.groq.com/keys

# Seed the database with demo accounts + sample tickets
python ../scripts/seed_data.py

# Start the API server
uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/api/v1/docs

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:3000

---

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@ticketiq.com | Admin@1234 |
| AI Intern (HR) | ai.intern@ticketiq.com | Agent@1234 |
| IT Support (IT + Finance) | it.agent@ticketiq.com | Agent@1234 |
| Jr Operations | ops.agent@ticketiq.com | Agent@1234 |
| Employee | employee@ticketiq.com | Employee@1234 |

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=sqlite+aiosqlite:///./ticketiq.db
SECRET_KEY=change-me-in-production-this-must-be-at-least-32-chars!
GROQ_API_KEY=gsk_your_groq_api_key_here   # ← paste your key here
GROQ_MODEL=llama3-8b-8192
APP_ENV=development
CORS_ORIGINS=http://localhost:3000
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## Deploy to Render (Backend) + Vercel (Frontend)

### Backend → Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo, set **Root Directory** to `backend`
4. **Build:** `pip install -r requirements.txt`
5. **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variable: `GROQ_API_KEY` = your key
7. After deploy, run seed: open Render shell → `python ../scripts/seed_data.py`

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project
2. Connect GitHub repo, set **Root Directory** to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Render backend URL
4. Deploy

---

## Project Structure

```
ticketiq/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # auth, tickets, admin, analytics
│   │   ├── core/               # config, deps
│   │   ├── db/                 # SQLite session
│   │   ├── models/             # SQLAlchemy models
│   │   └── services/
│   │       ├── ai/             # GROQ dynamic routing
│   │       ├── auth/           # JWT auth
│   │       └── tickets/        # ticket creation + agent assignment
│   ├── requirements.txt
│   └── .env                    # your secrets (not committed)
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js pages
│   │   ├── components/         # shared UI
│   │   ├── lib/                # API client
│   │   └── stores/             # Zustand auth store
│   └── .env.local
├── scripts/
│   └── seed_data.py
├── ticketiq.code-workspace     # open this in VS Code
└── README.md
```

---

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Zustand, Recharts
- **Backend:** FastAPI, SQLAlchemy async, SQLite (aiosqlite)
- **AI:** GROQ LLaMA 3 (llama3-8b-8192)
- **Auth:** JWT with refresh tokens
