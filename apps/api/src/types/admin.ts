export const STAFF_ROLES = ["owner", "admin", "catalog_manager", "support"] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export const STAFF_PERMISSIONS = [
  "admin:access",
  "staff:manage",
  "catalog:read",
  "catalog:write",
  "catalog:publish",
  "support:read",
  "audit:read",
] as const;
export type StaffPermission = typeof STAFF_PERMISSIONS[number];

export type StaffMember = {
  userId: string;
  role: StaffRole;
  status: "active" | "disabled";
};

export interface AdminGateway {
  getStaffMember(userId: string): Promise<StaffMember | null>;
}
