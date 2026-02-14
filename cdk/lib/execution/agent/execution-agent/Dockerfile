FROM python:3.11-slim

# Unbuffer stdout/stderr so logs appear in CloudWatch immediately (AgentCore captures container stdout)
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code. docs/ is copied here by deploy script (Pattern 1: bundle docs at build time) before build.
COPY . .

# AgentCore A2A protocol requires port 9000
EXPOSE 9000

CMD ["opentelemetry-instrument", "python", "main.py"]
