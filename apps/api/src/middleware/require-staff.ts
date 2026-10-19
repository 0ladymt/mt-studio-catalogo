import type { Context, Next } from "hono";
import type { SessionManager } from "../auth/session.js";
import type { AdminGateway, StaffMember, StaffPermission } from "../types/admin.js";
import type { AuthVariables } from "./authenticate.js";
import { roleHasPermissions } from "../auth/staff-permissions.js";

export type StaffVariables = AuthVariables & { staff: StaffMember };

export function requireStaff(
  sessions: SessionManager,
  admin: AdminGateway,
  required: readonly StaffPermission[] = ["admin:access"],
) {
  return async (context: Context<{ Variables: StaffVariables }>, next: Next) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ error: "authentication_required" }, 401);

    try {
      const staff = await admin.getStaffMember(session.user.id);
      if (!staff || staff.status !== "active" || !roleHasPermissions(staff.role, required)) {
        return context.json({ error: "admin_access_denied" }, 403);
      }
      context.set("accessToken", session.accessToken);
      context.set("user", session.user);
      context.set("staff", staff);
      await next();
    } catch {
      return context.json({ error: "admin_authorization_unavailable" }, 503);
    }
  };
}
