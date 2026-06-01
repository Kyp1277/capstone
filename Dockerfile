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

# Port default yang wajib digunakan oleh Hugging Face Spaces adalah 7860
EXPOSE 7860

# Jalankan Express API
CMD ["node", "server.js"]
