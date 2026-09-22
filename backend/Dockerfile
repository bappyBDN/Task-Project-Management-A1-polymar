FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal — psycopg[binary] and bcrypt ship prebuilt wheels,
# so no compiler toolchain is needed here.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Default command runs the web server. The `scheduler` service in
# docker-compose.yml overrides this with: python -m app.scheduler_worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]