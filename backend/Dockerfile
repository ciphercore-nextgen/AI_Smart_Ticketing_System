# ── Backend Dockerfile ────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create the data directory for SQLite persistence
# (docker-compose mounts a named volume at /app/data)
RUN mkdir -p /app/data

# Run as non-root for security
RUN adduser --disabled-password --gecos "" appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Start the API; uvicorn binds 0.0.0.0 so the health-check and frontend can reach it
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
