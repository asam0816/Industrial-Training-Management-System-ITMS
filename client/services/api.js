import axios from "axios";

/* =========================================================
   API BASE URL
========================================================= */

function normalizeBaseUrl(url) {
  return url ? url.trim().replace(/\/+$/, "") : "";
}

const isBrowser = typeof window !== "undefined";
const isDevelopment = process.env.NODE_ENV === "development";

const DEV_API_URL = "http://localhost:5000/api";
const PRODUCTION_API_URL = "https://itms-server.vercel.app/api";

const baseURL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_API_URL ||
    (isDevelopment ? DEV_API_URL : PRODUCTION_API_URL),
);

if (!baseURL) {
  console.error("API URL is missing. Configure NEXT_PUBLIC_API_URL.");
}

if (isBrowser && !isDevelopment) {
  console.log("ITMS API:", baseURL);
}

/* =========================================================
   ACCESS TOKEN HELPERS
========================================================= */

/*
 * Refresh token should remain inside an HTTP-only cookie.
 *
 * We only store the short-lived access token here as a
 * fallback for cross-origin deployments.
 */

const ACCESS_TOKEN_KEY = "itms_access_token";

function getAccessToken() {
  if (!isBrowser) {
    return null;
  }

  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveAccessToken(token) {
  if (!isBrowser || !token) {
    return;
  }

  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch (error) {
    console.error("Unable to save access token:", error);
  }
}

function removeAccessToken() {
  if (!isBrowser) {
    return;
  }

  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error("Unable to remove access token:", error);
  }
}

/* =========================================================
   AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL,

  /*
   * CRITICAL:
   *
   * Frontend:
   * https://itms-new.vercel.app
   *
   * Backend:
   * https://itms-server.vercel.app
   *
   * Cookies will not work correctly without this.
   */
  withCredentials: true,

  timeout: 30000,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

api.interceptors.request.use(
  (config) => {
    /*
     * Attach access token when available.
     *
     * Backend should support:
     *
     * Authorization: Bearer <token>
     */

    const token = getAccessToken();

    if (token) {
      config.headers = config.headers || {};

      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },

  (error) => {
    return Promise.reject(error);
  },
);

/* =========================================================
   REFRESH STATE
========================================================= */

/*
 * Multiple pages/components may send requests at exactly
 * the same time.
 *
 * If the access token expires, we only want ONE
 * /auth/refresh request.
 */

let refreshPromise = null;

/* =========================================================
   ROUTES THAT MUST NOT TRIGGER AUTO REFRESH
========================================================= */

function shouldSkipRefresh(url = "") {
  const skipRoutes = [
    "/auth/login",
    "/auth/refresh",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/logout",
  ];

  return skipRoutes.some((route) => url.includes(route));
}

/* =========================================================
   EXTRACT TOKEN
========================================================= */

/*
 * This supports backend responses such as:
 *
 * {
 *   accessToken: "..."
 * }
 *
 * OR
 *
 * {
 *   token: "..."
 * }
 *
 * OR
 *
 * {
 *   data: {
 *     accessToken: "..."
 *   }
 * }
 */

function extractAccessToken(response) {
  return (
    response?.data?.accessToken ||
    response?.data?.token ||
    response?.data?.data?.accessToken ||
    response?.data?.data?.token ||
    null
  );
}

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(
  /*
   * SUCCESS RESPONSE
   */
  (response) => {
    /*
     * If login or refresh returned a new access token,
     * automatically save it.
     */

    const token = extractAccessToken(response);

    if (token) {
      saveAccessToken(token);
    }

    /*
     * Logout succeeded → clear local access token.
     */

    if (response?.config?.url?.includes("/auth/logout")) {
      removeAccessToken();
    }

    return response;
  },

  /*
   * ERROR RESPONSE
   */
  async (error) => {
    const originalRequest = error?.config;

    /*
     * Network error / no backend response.
     */

    if (!error?.response) {
      console.error("API network error:", error?.message || error);

      return Promise.reject(error);
    }

    const status = error.response.status;
    const requestUrl = originalRequest?.url || "";

    /*
     * If error is NOT 401, don't refresh.
     */

    if (status !== 401) {
      return Promise.reject(error);
    }

    /*
     * Login / refresh itself failed.
     *
     * Never try refreshing these requests or we could
     * create an infinite loop.
     */

    if (shouldSkipRefresh(requestUrl)) {
      if (requestUrl.includes("/auth/refresh")) {
        removeAccessToken();
      }

      return Promise.reject(error);
    }

    /*
     * Already retried this request once.
     */

    if (originalRequest?._retry) {
      removeAccessToken();

      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      /*
       * Only ONE refresh request even when multiple
       * API calls fail at the same time.
       */

      if (!refreshPromise) {
        refreshPromise = api
          .post("/auth/refresh", null, {
            withCredentials: true,
          })
          .then((response) => {
            const newAccessToken = extractAccessToken(response);

            if (newAccessToken) {
              saveAccessToken(newAccessToken);
            }

            return response;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      await refreshPromise;

      /*
       * Retry failed original request.
       *
       * Request interceptor automatically attaches the
       * newly refreshed Bearer token.
       */

      return api(originalRequest);
    } catch (refreshError) {
      removeAccessToken();

      console.error(
        "Authentication refresh failed:",
        refreshError?.response?.data || refreshError?.message,
      );

      return Promise.reject(refreshError);
    }
  },
);

/* =========================================================
   AUTH TOKEN UTILITIES
========================================================= */

export function clearAccessToken() {
  removeAccessToken();
}

export function setAccessToken(token) {
  saveAccessToken(token);
}

export function readAccessToken() {
  return getAccessToken();
}

/* =========================================================
   EXPORT
========================================================= */

export default api;
