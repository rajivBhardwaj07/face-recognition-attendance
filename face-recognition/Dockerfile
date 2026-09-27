# Python Face Recognition Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV + face_recognition (dlib)
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    libboost-python-dev \
    libboost-thread-dev \
    ffmpeg \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p encodings captured_images

EXPOSE 8000

CMD ["python", "recognize_face.py"]
