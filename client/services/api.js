import axios from "axios";

/* =========================================================
   CONFIGURATION
========================================================= */

function normalizeBaseUrl(value) {
  if (!value) return "";

  return String(value).trim().replace(/\/+$/, "");
}

const DEV_API_URL = "http://localhost:5000/api";
const PROD_API_URL = "https://itms-server.vercel.app/api";

const baseURL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "development" ? DEV_API_URL : PROD_API_URL),
);

/* =========================================================
   ACCESS TOKEN STORAGE
========================================================= */

const ACCESS_TOKEN_KEY = "itms_access_token";

export function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token) {
  if (typeof window === "undefined" || !token) {
    return;
  }

  try {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // Ignore localStorage errors.
  }
}

export function clearAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // Ignore localStorage errors.
  }
}

/* =========================================================
   TOKEN EXTRACTION
========================================================= */

function extractAccessToken(response) {
  return (
    response?.data?.accessToken ||
    response?.data?.data?.accessToken ||
    response?.data?.token ||
    response?.data?.data?.token ||
    null
  );
}

/* =========================================================
   AXIOS CLIENTS
========================================================= */

const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30000,

  headers: {
    Accept: "application/json",
  },
});

/*
 * Separate Axios instance so refresh itself
 * does not enter the normal response interceptor.
 */
const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30000,

  headers: {
    Accept: "application/json",
  },
});

/* =========================================================
   REQUEST INTERCEPTOR
========================================================= */

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken();

    if (token) {
      config.headers = config.headers || {};

      config.headers.Authorization = `Bearer ${token}`;
    }

    /*
     * IMPORTANT:
     *
     * Do not manually set Content-Type for
     * FormData.
     *
     * Browser/Axios must create multipart
     * boundary automatically.
     */
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      if (typeof config.headers?.delete === "function") {
        config.headers.delete("Content-Type");
      } else if (config.headers) {
        delete config.headers["Content-Type"];

        delete config.headers["content-type"];
      }
    }

    return config;
  },

  (error) => Promise.reject(error),
);

/* =========================================================
   AUTH ENDPOINT CHECK
========================================================= */

function isAuthEndpoint(url = "") {
  return [
    "/auth/login",
    "/auth/logout",
    "/auth/refresh",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].some((route) => String(url).includes(route));
}

/* =========================================================
   REFRESH LOCK
========================================================= */

let refreshPromise = null;

async function performRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post("/auth/refresh", {})
      .then((response) => {
        const token = extractAccessToken(response);

        if (!token) {
          throw new Error("Refresh endpoint did not return an access token");
        }

        setAccessToken(token);

        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/* =========================================================
   RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(
  (response) => {
    /*
     * Save any new access token automatically.
     */
    const token = extractAccessToken(response);

    if (token) {
      setAccessToken(token);
    }

    return response;
  },

  async (error) => {
    const originalRequest = error?.config;

    if (!error?.response) {
      return Promise.reject(error);
    }

    const status = error.response.status;

    if (status !== 401) {
      return Promise.reject(error);
    }

    const url = originalRequest?.url || "";

    /*
     * Never refresh login/refresh/etc.
     */
    if (isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    /*
     * Prevent infinite retry.
     */
    if (originalRequest?._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    /*
     * CRITICAL FIX
     *
     * Remember which access token existed
     * when this failed request started.
     *
     * An old unauthenticated /auth/me request
     * must NOT delete a token created by a
     * newer successful login.
     */
    const tokenBeforeRefresh = getAccessToken();

    try {
      const newToken = await performRefresh();

      originalRequest.headers = originalRequest.headers || {};

      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      /*
       * CRITICAL RACE-CONDITION FIX
       *
       * Only clear the token when it is still
       * the same token that belonged to this
       * failed request.
       *
       * If login happened meanwhile, there may
       * now be a fresh token. Do NOT delete it.
       */
      const currentToken = getAccessToken();

      if (!currentToken || currentToken === tokenBeforeRefresh) {
        clearAccessToken();
      }

      error.isAuthFailure = true;

      return Promise.reject(error);
    }
  },
);

/* =========================================================
   LOGIN
========================================================= */

export async function loginRequest(credentials) {
  const response = await api.post("/auth/login", credentials);

  const token = extractAccessToken(response);

  if (!token) {
    throw new Error("Login succeeded but no access token was returned");
  }

  /*
   * Explicitly save token.
   */
  setAccessToken(token);

  return response;
}

/* =========================================================
   LOGOUT
========================================================= */

export async function logoutRequest() {
  try {
    await api.post("/auth/logout");
  } catch (error) {
    /*
     * Even when server logout fails,
     * remove local authentication.
     */
    console.warn("Server logout unavailable:", error?.message);
  } finally {
    clearAccessToken();
  }
}

/* =========================================================
   EXPORT
========================================================= */

export default api;
