# TicketIQ — Docker Fix

## Files and where they go

```
ticketIQ-fixed/docker/
├── docker-compose.yml          →  ticketiq/docker-compose.yml          (replace)
├── backend/
│   ├── Dockerfile              →  ticketiq/backend/Dockerfile           (replace)
│   └── .env                    →  ticketiq/backend/.env                 (replace)
└── frontend/
    ├── Dockerfile              →  ticketiq/frontend/Dockerfile          (replace)
    └── next.config.js          →  ticketiq/frontend/next.config.js      (replace)
```

## How to run

```powershell
cd ticketiq
docker compose up --build
```
Demo Link https://ticketiq-frontend.onrender.com 
Open http://localhost:3000 — the frontend, http://localhost:8000/api/v1/docs — the API.

---

## What was wrong and what was fixed

### 1. NEXT_PUBLIC_API_URL set at runtime, not build time
`NEXT_PUBLIC_*` variables are baked into the JavaScript bundle by the Next.js
compiler. Setting them under `environment:` in docker-compose only affects the
Node process at runtime — by that point the bundle is already built and the
value is ignored.

**Fix:** `docker-compose.yml` now passes it as a `build arg`, and the frontend
`Dockerfile` accepts it with `ARG NEXT_PUBLIC_API_URL` before running
`npm run build`.

### 2. Frontend calling localhost:8000 from inside a container
The browser runs on the host machine, not inside Docker, so `localhost:8000`
is correct for the end user — the API port is published to the host.
The `NEXT_PUBLIC_API_URL` is intentionally set to `http://localhost:8000/api/v1`
for this reason.

### 3. SQLite database not persisted
The backend wrote `./ticketiq.db` relative to `/app`, but the volume was
mounted at `/app/data`, so the two never overlapped. Every container restart
wiped the database.

**Fix:** `DATABASE_URL` now points to `/app/data/ticketiq.db` (four slashes
for an absolute path with `sqlite+aiosqlite`). The `Dockerfile` creates that
directory, and the named volume covers it.

### 4. depends_on did not wait for the backend to be ready
`depends_on: backend` only waits for the container to *start*, not for the
FastAPI process to be accepting connections. The frontend would boot and
immediately get connection errors on its first API call.

**Fix:** The backend now has a `healthcheck` that pings `/api/v1/health`.
`depends_on` uses `condition: service_healthy` so the frontend only starts
once the backend is actually up.

### 5. CORS blocked Docker-internal and host requests
`CORS_ORIGINS` was only `http://localhost:3000`. Requests from the frontend
container or from the Docker bridge network would be rejected.

**Fix:** CORS now includes both `http://localhost:3000` and
`http://ticketiq-frontend:3000`.

### 6. Frontend Docker image included all dev dependencies
The old single-stage `FROM node:22` image ran `npm install` (dev + prod) and
served from the same layer — ~1 GB image, with all dev tooling in production.

**Fix:** Three-stage build — `deps` installs, `builder` compiles, `runner`
copies only the standalone output. Final image is ~150 MB.
Requires `output: 'standalone'` in `next.config.js` (included).

### 7. No restart policy
If either container crashed (e.g. OOM, DB error on startup) it would stay
down permanently until manually restarted.

**Fix:** Both services now have `restart: unless-stopped`.
