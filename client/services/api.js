import axios from "axios";

function normalizeBaseUrl(url) {
  return url ? url.replace(/\/+$/, "") : url; // remove trailing slash
}

const isBrowser = typeof window !== "undefined";

// Dev fallback only (so production never accidentally uses localhost)
const devFallback = "http://localhost:5000/api";

const baseURL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "development" ? devFallback : ""),
);

// Optional: show a clear error in production if env is missing
if (!baseURL && isBrowser) {
  // This will help you immediately see the issue in the console
  console.error(
    "NEXT_PUBLIC_API_URL is not set. Set it in Vercel env variables to your BACKEND URL (example: https://YOUR-BACKEND.vercel.app/api).",
  );
}

const api = axios.create({
  baseURL: baseURL || devFallback, // last resort fallback
  withCredentials: true,
});

let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;

    const skip = [
      "/auth/refresh",
      "/auth/login",
      "/auth/forgot-password",
      "/auth/reset-password",
    ].some((x) => original?.url?.includes(x));

    if (err.response?.status === 401 && !original?._retry && !skip) {
      original._retry = true;
      try {
        refreshing ||= api.post("/auth/refresh").finally(() => {
          refreshing = null;
        });
        await refreshing;
        return api(original);
      } catch {
        throw err;
      }
    }

    throw err;
  },
);

export default api;
