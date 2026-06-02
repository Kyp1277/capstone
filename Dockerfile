# Gunakan image resmi yang berisi Node.js dan Python sekaligus
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

# Install system dependencies yang dibutuhkan oleh easyocr, pdfplumber, dan database
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    ffmpeg \
    libsm6 \
    libxext6 \
    tesseract-ocr \
    tesseract-ocr-ind \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin package.json & install dependencies Node.js
COPY package*.json ./
RUN npm install

# Salin requirements.txt & install Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Salin seluruh isi kode proyek
COPY . .

# Build frontend SPA statis menggunakan Vite
RUN npm run build

# Di image base node, user dengan UID 1000 sudah ada (bernama 'node').
# Kita hanya perlu mengubah kepemilikan folder /app ke UID 1000 dan berpindah user.
RUN chown -R 1000:1000 /app
USER 1000
ENV HOME=/home/node
ENV PATH=/home/node/.local/bin:$PATH

# Pre-download models saat build agar tidak timeout saat request pertama
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'); SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
RUN python -c "import easyocr; easyocr.Reader(['id', 'en'], gpu=False)"

# Port default yang wajib digunakan oleh Hugging Face Spaces adalah 7860
ENV HOST=0.0.0.0
EXPOSE 7860

# Jalankan Express API
CMD ["node", "server.js"]
