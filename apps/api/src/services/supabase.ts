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
