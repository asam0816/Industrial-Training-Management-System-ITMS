"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import api, {
  getAccessToken,
  loginRequest,
  logoutRequest,
} from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);

  /*
   * Prevent overlapping initial user loads
   * during development/React Strict Mode.
   */
  const bootStarted = useRef(false);

  /* =====================================================
     CURRENT USER
  ===================================================== */

  const refreshUser = async () => {
    try {
      const response = await api.get("/auth/me");

      const currentUser = response?.data?.data?.user;

      if (!currentUser) {
        throw new Error("Current user was not returned");
      }

      setUser(currentUser);

      return currentUser;
    } catch (error) {
      setUser(null);

      return null;
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     INITIAL SESSION CHECK
  ===================================================== */

  useEffect(() => {
    if (bootStarted.current) {
      return;
    }

    bootStarted.current = true;

    const boot = async () => {
      /*
       * Existing bearer token:
       * verify normally.
       *
       * No bearer token:
       * /auth/me will try refresh cookie once
       * through the Axios interceptor.
       */
      await refreshUser();
    };

    boot();
  }, []);

  /* =====================================================
     LOGIN
  ===================================================== */

  const login = async (credentials) => {
    /*
     * Stop the UI from using any stale
     * authentication state.
     */
    setLoading(true);

    try {
      const response = await loginRequest(credentials);

      const loggedInUser = response?.data?.data?.user;

      if (!loggedInUser) {
        throw new Error("Login response did not contain user data");
      }

      /*
       * loginRequest() has already saved
       * itms_access_token.
       */
      const token = getAccessToken();

      if (!token) {
        throw new Error("Authentication token could not be stored");
      }

      setUser(loggedInUser);

      return loggedInUser;
    } finally {
      setLoading(false);
    }
  };

  /* =====================================================
     LOGOUT
  ===================================================== */

  const logout = async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  /* =====================================================
     CONTEXT
  ===================================================== */

  const value = useMemo(
    () => ({
      user,

      role: user?.role,

      isAuthenticated: Boolean(user),

      loading,

      login,

      logout,

      refreshUser,
    }),

    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
