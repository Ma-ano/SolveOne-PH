import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authApi } from "./authApi";
import { apiRequest } from "../../services/api/client";
import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
  usesCookieRefresh,
} from "./refreshTokenStorage";

const emptySession = Object.freeze({ accessToken: null, user: null });
const AuthContext = createContext(null);
let initialHydrationPromise;

function isSessionRejected(error) {
  return [400, 401, 403].includes(error?.status);
}

async function loadInitialSession() {
  if (usesCookieRefresh) {
    try {
      const result = await authApi.restoreSession();
      return result.session;
    } catch {
      return null;
    }
  }

  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  try {
    const session = await authApi.refresh(refreshToken);
    await setRefreshToken(session.refreshToken);
    return session;
  } catch (error) {
    if (isSessionRejected(error)) {
      await clearRefreshToken();
    }
    return null;
  }
}

function getInitialSession() {
  if (!initialHydrationPromise) {
    initialHydrationPromise = loadInitialSession().finally(() => {
      initialHydrationPromise = null;
    });
  }

  return initialHydrationPromise;
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(emptySession);
  const [status, setStatus] = useState("loading");
  const refreshPromise = useRef(null);

  const establishSession = useCallback(
    async ({ accessToken, refreshToken, user }) => {
      if (typeof accessToken !== "string" || !accessToken || !user) {
        throw new Error("A valid access token and user are required");
      }

      if (
        !usesCookieRefresh &&
        (!refreshToken || typeof refreshToken !== "string")
      ) {
        throw new Error("A native session requires a refresh token");
      }

      await setRefreshToken(refreshToken);
      setSession({ accessToken, user });
      setStatus("authenticated");
    },
    [],
  );

  const clearSession = useCallback(async () => {
    await clearRefreshToken();
    setSession(emptySession);
    setStatus("anonymous");
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    getInitialSession().then((restoredSession) => {
      if (!active) {
        return;
      }

      if (restoredSession) {
        setSession({
          accessToken: restoredSession.accessToken,
          user: restoredSession.user,
        });
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (credentials) => {
      const nextSession = await authApi.login(credentials);

      try {
        await establishSession(nextSession);
      } catch (error) {
        try {
          await authApi.logout({
            accessToken: nextSession.accessToken,
            refreshToken: nextSession.refreshToken,
          });
        } catch {
          // The original protected-storage failure is the actionable error.
        }
        throw error;
      }

      return nextSession.user;
    },
    [establishSession],
  );

  const refresh = useCallback(async () => {
    if (refreshPromise.current) {
      return refreshPromise.current;
    }

    refreshPromise.current = (async () => {
      const storedRefreshToken = await getRefreshToken();

      if (!usesCookieRefresh && !storedRefreshToken) {
        await clearSession();
        return null;
      }

      try {
        const nextSession = await authApi.refresh(storedRefreshToken);
        await establishSession(nextSession);
        return nextSession.accessToken;
      } catch (error) {
        if (isSessionRejected(error)) {
          await clearSession();
        }
        throw error;
      } finally {
        refreshPromise.current = null;
      }
    })();

    return refreshPromise.current;
  }, [clearSession, establishSession]);

  const logout = useCallback(async () => {
    const refreshToken = await getRefreshToken();

    try {
      await authApi.logout({ accessToken: session.accessToken, refreshToken });
    } catch {
      // Local logout must still complete when the network is unavailable.
    } finally {
      await clearSession();
    }
  }, [clearSession, session.accessToken]);

  const logoutAll = useCallback(async () => {
    try {
      if (session.accessToken) {
        await authApi.logoutAll(session.accessToken);
      }
    } finally {
      await clearSession();
    }
  }, [clearSession, session.accessToken]);

  const authenticatedRequest = useCallback(
    async (path, options = {}) => {
      try {
        return await apiRequest(path, {
          ...options,
          accessToken: session.accessToken,
        });
      } catch (error) {
        if (error?.status !== 401 || !session.accessToken) {
          throw error;
        }

        const nextAccessToken = await refresh();

        if (!nextAccessToken) {
          throw error;
        }

        return apiRequest(path, {
          ...options,
          accessToken: nextAccessToken,
        });
      }
    },
    [refresh, session.accessToken],
  );

  const updateCurrentUser = useCallback(
    (nextUser) => {
      if (!nextUser || nextUser.id !== session.user?.id) {
        throw new Error("The updated profile does not match the current user");
      }

      setSession((current) => ({ ...current, user: nextUser }));
    },
    [session.user?.id],
  );

  const value = useMemo(
    () => ({
      accessToken: session.accessToken,
      user: session.user,
      status,
      isAuthenticated: Boolean(session.user),
      establishSession,
      clearSession,
      login,
      logout,
      logoutAll,
      refresh,
      authenticatedRequest,
      updateCurrentUser,
    }),
    [
      clearSession,
      authenticatedRequest,
      establishSession,
      login,
      logout,
      logoutAll,
      refresh,
      session,
      status,
      updateCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
