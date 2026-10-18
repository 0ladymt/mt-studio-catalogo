import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AuthGateway, Profile } from "../types/auth.js";

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

  return {
    async verifyAccessToken(token) {
      const { data, error } = await clientFor(token).auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },

    async refreshSession(refreshToken) {
      const client = clientFor("");
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session || !data.user) return null;
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        user: { id: data.user.id },
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
