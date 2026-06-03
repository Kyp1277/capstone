import { navigate, render } from "./router.js";
import { replaceAnalyses, saveAnalysis, state } from "./state.js";
import { apiErrorMessage, http, httpDirect } from "./http.js";
import { showToast } from "./utils.js";

// Mengirim CV untuk dianalisis dan mengubah response menjadi data dashboard.
export async function analyzeCv() {
  const isAutoMode = state.analysisMode === "auto";
  if (!state.selectedFile || (!isAutoMode && state.targetRole.trim().length < 3)) {
    state.error = isAutoMode
      ? "Pilih file CV terlebih dahulu."
      : "Lengkapi file CV dan target pekerjaan terlebih dahulu.";
    render();
    return;
  }

  state.isAnalyzing = true;
  state.loadingStep = 0;   // step 0 = pre-warm phase
  state.error = "";

  render();

  // ── Pre-warm: bangunkan HF Space sebelum analisis ──────────────────────────
  // Hugging Face free tier mematikan container saat idle. Ping /health dulu
  // agar server aktif sebelum request analisis yang berat dikirim.
  // Percobaan maksimal 3x dengan jeda 3 detik agar cold start (~30-60 detik) berhasil.
  await warmupBackend();
  // ─────────────────────────────────────────────────────────────────────────

  state.loadingStep = 1;
  render();

  const loadingTimer = window.setInterval(() => {
    if (!state.isAnalyzing) {
      window.clearInterval(loadingTimer);
      return;
    }
    state.loadingStep = Math.min(Number(state.loadingStep || 1) + 1, 4);
    render();
  }, 1100);

  try {
    // Request berisi file PDF, mode analisis, dan target role.
    const formData = new FormData();
    formData.append("cv", state.selectedFile);
    formData.append("analysisMode", state.analysisMode);
    formData.append("targetRole", isAutoMode ? "Pekerjaan paling cocok dari CV" : state.targetRole.trim());

    // Gunakan httpDirect (langsung ke HF backend) untuk bypass
    // batas timeout Vercel proxy pada paket gratis.
    const { data: payload } = await httpDirect.post("/api/analyses", formData);

    const analysis = normalizeAnalysisResponse(payload);
    const savedAnalysis = saveAnalysis(analysis);
    if (state.selectedFileUrl) {
      URL.revokeObjectURL(state.selectedFileUrl);
      state.selectedFileUrl = "";
    }
    state.isAnalyzing = false;
    state.loadingStep = 0;
    state.selectedFile = null;
    state.targetRole = "";
    state.uploadStep = 1;
    state.selectedJobId = "";
    window.clearInterval(loadingTimer);
    showToast("Analisis CV selesai! Membuka dashboard...", "success");
    navigate(`/dashboard/${savedAnalysis.id}`);
  } catch (error) {
    state.isAnalyzing = false;
    state.loadingStep = 0;
    window.clearInterval(loadingTimer);

    // Kirim detail error ke server log sebelum merender UI alert
    sendClientLog({
      message: `Axios / Analysis Failure: ${error.message}`,
      source: "js/api.js",
      lineno: 51,
      colno: 0,
      stack: error.stack || (error.config ? JSON.stringify(error.config) : "")
    });

    state.error =
      apiErrorMessage(error, "Analisis gagal diproses. Coba beberapa saat lagi.") ||
      "Analisis gagal diproses. Coba beberapa saat lagi.";
    showToast(state.error, "error");
    render();
  }
}

/**
 * Ping /health langsung ke HF backend untuk membangunkan container yang idle.
 * Coba maksimal 3x dengan timeout 20 detik per percobaan.
 * Tidak throw error jika gagal — analisis tetap dilanjutkan.
 */
async function warmupBackend() {
  const MAX_TRIES = 3;
  const TIMEOUT_MS = 20000;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      await httpDirect.get("/health", { timeout: TIMEOUT_MS });
      return; // sukses, server sudah aktif
    } catch {
      // Gagal ping — mungkin masih cold start, coba lagi
      if (attempt < MAX_TRIES) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
  // Kalau semua percobaan gagal, lanjut saja — mungkin tetap bisa analisis
}


export async function loadAnalyses() {
  if (!state.auth.token) {
    return [];
  }

  const { data: payload } = await http.get("/api/analyses");

  return replaceAnalyses(Array.isArray(payload.analyses) ? payload.analyses : []);
}

export async function loadAnalysisDetail(id) {
  if (!state.auth.token || !id) {
    return null;
  }

  const { data: payload } = await http.get(`/api/analyses/${encodeURIComponent(id)}`);

  return saveAnalysis(normalizeAnalysisResponse(payload));
}

function normalizeAnalysisResponse(payload) {
  // Normalisasi menjaga dashboard tetap aman walaupun ada field response yang kosong.
  return {
    ...(state.currentAnalysis || {}),
    id: payload.id || `analysis-${Date.now()}`,
    targetRole: payload.targetRole || state.targetRole.trim() || "Analisis CV",
    date: payload.date || new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }),
    score: Number(payload.score || 0),
    analysisMode: payload.analysisMode || state.analysisMode,
    verdict: payload.verdict || "Analisis Selesai",
    summary: payload.summary || "Analisis CV berhasil diproses.",
    detectedSkills: Array.isArray(payload.detectedSkills) ? payload.detectedSkills : [],
    workExperiences: Array.isArray(payload.workExperiences) ? payload.workExperiences : [],
    totalExperienceYears: Number(payload.totalExperienceYears || 0),
    experienceLevel: payload.experienceLevel || "entry_level",
    experienceMatch: Number(payload.experienceMatch || 0),
    missingSkills: Array.isArray(payload.missingSkills) ? payload.missingSkills : [],
    improvements: Array.isArray(payload.improvements) ? payload.improvements : [],
    jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : []
  };
}

export async function sendClientLog(logData) {
  try {
    await httpDirect.post("/api/logs", logData);
  } catch (err) {
    // Abaikan gagal log agar tidak memicu loop error
  }
}
