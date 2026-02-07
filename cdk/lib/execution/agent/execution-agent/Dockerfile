FROM --platform=linux/arm64 python:3.11-slim

WORKDIR /app

# Install dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# AgentCore A2A protocol requires port 9000
EXPOSE 9000

CMD ["python", "main.py"]
