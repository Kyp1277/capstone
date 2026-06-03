import "./tailwind.css";
import { render } from "./router.js";
import { state } from "./state.js";
import { restoreSession } from "./auth.js";
import { sendClientLog } from "./api.js";

// Entry point aplikasi: render awal dan pantau perubahan route.
window.addEventListener("hashchange", () => {
  // Saat pindah halaman, menu mobile dan dropdown akun ditutup agar UI selalu kembali rapi.
  state.mobileMenuOpen = false;
  state.accountMenuOpen = false;
  render();
});

// Tangkap uncaught runtime errors di browser
window.addEventListener("error", (event) => {
  sendClientLog({
    message: event.message || "Uncaught Error",
    source: event.filename || "unknown",
    lineno: event.lineno || 0,
    colno: event.colno || 0,
    stack: event.error?.stack || ""
  });
});

// Tangkap unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  sendClientLog({
    message: `Unhandled Promise Rejection: ${event.reason?.message || event.reason}`,
    source: "promise",
    lineno: 0,
    colno: 0,
    stack: event.reason?.stack || ""
  });
});

// Render pertama cepat memakai cache, lalu sinkronkan session dan riwayat dari database.
render();
restoreSession().finally(render);
