import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AuthGateway, AuthSession, Profile } from "../types/auth.js";

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
      return { id: data.user.id, email: data.user.email };
    },

    async refreshSession(refreshToken) {
      const client = clientFor("");
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user) return null;
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        user: { id: data.user.id, email: data.user.email },
      };
    },

    async revokeSession(accessToken) {
      const response = await fetch(`${environment.SUPABASE_URL}/auth/v1/logout?scope=global`, {
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
        user: { id: data.user.id, email: data.user.email },
      };
      return session;
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
  };
}

function isNonEnumeratingAuthOutcome(error: { status?: number; code?: string; message?: string }): boolean {
  if (error.code === "user_already_exists" || error.code === "email_exists") return true;
  if (error.status === 422 && /already|registered|confirmed/i.test(error.message ?? "")) return true;
  return error.status !== undefined && error.status >= 400 && error.status < 500;
}
