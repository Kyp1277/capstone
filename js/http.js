import axios from "axios";
import { API_BASE_URL, state } from "./state.js";

// URL backend Hugging Face langsung — dipakai untuk bypass Vercel proxy
// yang memiliki batas timeout 10 detik pada paket gratis.
const HF_BACKEND_URL = "https://arielfarz-jobfit-backend.hf.space";

// http — untuk request ringan (auth, riwayat, health) yang lewat Vercel.
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

// httpDirect — untuk analisis CV yang butuh waktu lama.
// Langsung ke HF backend agar tidak terkena batas timeout Vercel (10 detik).
export const httpDirect = axios.create({
  baseURL: HF_BACKEND_URL,
  timeout: 180000
});

function attachAuthHeader(config) {
  if (state.auth.token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${state.auth.token}`;
  }
  return config;
}

http.interceptors.request.use(attachAuthHeader);
httpDirect.interceptors.request.use(attachAuthHeader);

export function apiErrorMessage(error, fallback = "Layanan sedang bermasalah. Coba beberapa saat lagi.") {
  const detail = error?.response?.data?.detail || error?.response?.data?.error;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        const location = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
        const message = item.msg || "Validasi request gagal.";
        return location ? `${location}: ${message}` : message;
      })
      .join(" ");
  }

  return error?.message || fallback;
}
