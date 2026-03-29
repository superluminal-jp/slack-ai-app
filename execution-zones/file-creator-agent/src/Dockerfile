FROM python:3.11-slim

# Unbuffer stdout/stderr for local development and debugging
ENV PYTHONUNBUFFERED=1
# Enable OTel Python logging bridge so log records reach CloudWatch via ADOT exporter
ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code. docs/ is copied here by deploy script (Pattern 1: bundle docs at build time) before build.
COPY . .

# AgentCore A2A protocol requires port 9000
EXPOSE 9000

CMD ["opentelemetry-instrument", "python", "main.py"]
