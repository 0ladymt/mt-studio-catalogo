import { createClient } from "@supabase/supabase-js";
import type { ApiEnvironment } from "../config/env.js";
import type { AdminGateway, StaffMember } from "../types/admin.js";

export function createAdminSupabaseGateway(environment: ApiEnvironment): AdminGateway {
  const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return unavailableAdminGateway();

  const client = createClient(environment.SUPABASE_URL, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    async getStaffMember(userId) {
      const { data, error } = await client
        .from("staff_members")
        .select("user_id,role,status")
        .eq("user_id", userId)
        .maybeSingle<{ user_id: string; role: StaffMember["role"]; status: StaffMember["status"] }>();
      if (error) throw new Error("staff-authorization-query-failed");
      return data ? { userId: data.user_id, role: data.role, status: data.status } : null;
    },
  };
}

export function unavailableAdminGateway(): AdminGateway {
  return {
    async getStaffMember() {
      throw new Error("admin-gateway-not-configured");
    },
  };
}
