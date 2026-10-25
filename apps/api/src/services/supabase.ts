import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AuthGateway, AuthSession, AuthenticatedUser, Profile } from "../types/auth.js";

export function createSupabaseAuthGateway(environment: ApiEnvironment): AuthGateway {
  const clientFor = (token: string) =>
    createClient(environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  const oauthClient = (storageValues: Record<string, string>) => {
    const storage = {
      getItem: async (key: string) => storageValues[key] ?? null,
      setItem: async (key: string, value: string) => { storageValues[key] = value; },
      removeItem: async (key: string) => { delete storageValues[key]; },
    };
    return createClient(environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        flowType: "pkce",
        storage,
      },
    });
  };

  return {
    async verifyAccessToken(token) {
      const { data, error } = await clientFor(token).auth.getUser(token);
      if (error || !data.user) return null;
      return userSummary(data.user);
    },

    async refreshSession(refreshToken) {
      const client = clientFor("");
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user) return null;
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        user: userSummary(data.user),
      };
    },

    async revokeSession(accessToken, scope = "global") {
      const response = await fetch(`${environment.SUPABASE_URL}/auth/v1/logout?scope=${scope}`, {
        method: "POST",
        headers: {
          apikey: environment.SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok && response.status !== 401) throw new Error("session-revocation-failed");
    },

    async signUpWithPassword({ displayName, email, password }) {
      const client = clientFor("");
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error && !isNonEnumeratingAuthOutcome(error)) throw new Error("signup-unavailable");
    },

    async confirmSignup(email, token) {
      const client = clientFor("");
      const { data, error } = await client.auth.verifyOtp({ email, token, type: "signup" });
      if (error || !data.user) return false;
      if (data.session?.access_token) await this.revokeSession(data.session.access_token);
      return true;
    },

    async confirmSignupSession(email, token) {
      const client = clientFor("");
      const { data, error } = await client.auth.verifyOtp({ email, token, type: "signup" });
      if (error || !data.user || !data.session) return null;
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        user: userSummary(data.user),
      };
    },

    async resendSignupConfirmation(email) {
      const client = clientFor("");
      const { error } = await client.auth.resend({ type: "signup", email });
      if (error && !isNonEnumeratingAuthOutcome(error)) throw new Error("resend-unavailable");
    },

    async signInWithPassword(email, password) {
      const client = clientFor("");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "email_not_confirmed") return { status: "email_not_confirmed" };
        if (error.code === "invalid_credentials" || error.status === 400) {
          return { status: "invalid_credentials" };
        }
        throw new Error("login-unavailable");
      }
      if (!data.session || !data.user) throw new Error("login-session-missing");
      if (!data.user.email_confirmed_at) return { status: "email_not_confirmed" };
      return {
        status: "authenticated",
        session: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresIn: data.session.expires_in,
          user: { id: data.user.id, email: data.user.email },
        },
      };
    },

    async requestPasswordRecovery(email) {
      const client = clientFor("");
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error && !isNonEnumeratingAuthOutcome(error)) throw new Error("recovery-unavailable");
    },

    async resetPasswordWithOtp(email, token, password) {
      const client = clientFor("");
      const { data, error } = await client.auth.verifyOtp({ email, token, type: "recovery" });
      if (error || !data.session || !data.user) return false;
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw new Error("password-update-unavailable");
      await this.revokeSession(data.session.access_token);
      return true;
    },

    async beginGoogleOAuth(callbackUrl) {
      const pkceStorage: Record<string, string> = {};
      const client = oauthClient(pkceStorage);
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) throw new Error("google-oauth-start-failed");
      return { authorizationUrl: data.url, pkceStorage };
    },

    async completeGoogleOAuth(code, pkceStorage) {
      const client = oauthClient({ ...pkceStorage });
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session || !data.user) return null;
      const session: AuthSession = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        user: userSummary(data.user),
      };
      return session;
    },

    async confirmCurrentPassword(email, password, expectedUserId) {
      const result = await this.signInWithPassword(email, password);
      if (result.status !== "authenticated") return false;
      try {
        return result.session.user.id === expectedUserId;
      } finally {
        await this.revokeSession(result.session.accessToken, "local");
      }
    },

    async beginGoogleIdentityLink(session, callbackUrl) {
      const pkceStorage: Record<string, string> = {};
      const client = oauthClient(pkceStorage);
      const { error: sessionError } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (sessionError) throw new Error("google-link-session-invalid");
      const { data, error } = await client.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error || !data.url) throw new Error("google-link-start-failed");
      const verifierStorage = Object.fromEntries(
        Object.entries(pkceStorage).filter(([key]) => key.includes("code-verifier")),
      );
      return { authorizationUrl: data.url, pkceStorage: verifierStorage };
    },

    async completeGoogleIdentityLink(code, pkceStorage) {
      return this.completeGoogleOAuth(code, pkceStorage);
    },

    async hasPassword(accessToken, userId) {
      const { data, error } = await clientFor(accessToken)
        .from("profiles")
        .select("password_configured_at")
        .eq("user_id", userId)
        .maybeSingle<{ password_configured_at: string | null }>();
      if (error || !data) throw new Error("password-capability-query-failed");
      return Boolean(data.password_configured_at);
    },

    async requestPasswordSetup(session, expectedUserId) {
      const client = oauthClient({});
      const { error: sessionError } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (sessionError) return false;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || userData.user?.id !== expectedUserId || !userData.user.email_confirmed_at) return false;
      const { error } = await client.auth.reauthenticate();
      if (error) throw new Error("password-setup-otp-unavailable");
      return true;
    },

    async setupPasswordWithOtp(session, expectedUserId, nonce, password) {
      const client = oauthClient({});
      const { error: sessionError } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (sessionError) return "invalid_or_expired";
      const { data: before, error: beforeError } = await client.auth.getUser();
      if (beforeError || before.user?.id !== expectedUserId || !before.user.email_confirmed_at) return "invalid_or_expired";
      const { data, error } = await client.auth.updateUser({ password, nonce });
      if (error) {
        if (["reauthentication_not_valid", "otp_expired", "reauth_nonce_missing"].includes(error.code ?? "")) {
          return "invalid_or_expired";
        }
        throw new Error("password-setup-unavailable");
      }
      if (data.user?.id !== expectedUserId) throw new Error("password-setup-user-mismatch");
      const { error: markerError } = await client.rpc("mark_own_password_configured");
      if (markerError) throw new Error("password-capability-marker-failed");
      const { error: revokeError } = await client.auth.signOut({ scope: "global" });
      if (revokeError) throw new Error("session-revocation-failed");
      return "updated";
    },

    async getOwnProfile(token, userId) {
      const { data, error } = await clientFor(token)
        .from("profiles")
        .select("user_id,display_name,status,created_at,updated_at")
        .eq("user_id", userId)
        .maybeSingle<Profile>();

      if (error) throw new Error("profile-query-failed");
      return data;
    },

    async updateOwnProfile(token, userId, displayName) {
      const { data, error } = await clientFor(token)
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", userId)
        .select("user_id,display_name,status,created_at,updated_at")
        .maybeSingle<Profile>();

      if (error) throw new Error("profile-update-failed");
      return data;
    },
  };
}

function userSummary(user: { id: string; email?: string; email_confirmed_at?: string; identities?: Array<{ provider: string }> }): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    providers: [...new Set((user.identities ?? []).map((identity) => identity.provider))],
  };
}

function isNonEnumeratingAuthOutcome(error: { status?: number; code?: string; message?: string }): boolean {
  if (error.code === "user_already_exists" || error.code === "email_exists") return true;
  if (error.status === 422 && /already|registered|confirmed/i.test(error.message ?? "")) return true;
  return error.status !== undefined && error.status >= 400 && error.status < 500;
}
