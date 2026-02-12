FROM python:3.11-slim

# Unbuffer stdout/stderr so logs appear in CloudWatch immediately (AgentCore captures container stdout)
ENV PYTHONUNBUFFERED=1

# Pass from CDK buildArgs to invalidate cache when needed (e.g. CDK_DOCKER_CACHEBUST=1)
ARG CACHEBUST=
RUN echo "Build: ${CACHEBUST}" > /dev/null

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# AgentCore A2A protocol requires port 9000
EXPOSE 9000

CMD ["python", "main.py"]
