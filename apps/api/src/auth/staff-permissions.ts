import type { StaffPermission, StaffRole } from "../types/admin.js";

const matrix = {
  owner: ["admin:access", "staff:manage", "catalog:read", "catalog:write", "catalog:publish", "support:read", "audit:read"],
  admin: ["admin:access", "catalog:read", "catalog:write", "catalog:publish", "support:read", "audit:read"],
  catalog_manager: ["admin:access", "catalog:read", "catalog:write", "catalog:publish"],
  support: ["admin:access", "support:read"],
} as const satisfies Record<StaffRole, readonly StaffPermission[]>;

export function permissionsForRole(role: StaffRole): StaffPermission[] {
  return [...matrix[role]];
}

export function roleHasPermissions(role: StaffRole, required: readonly StaffPermission[]): boolean {
  const available = new Set<StaffPermission>(matrix[role]);
  return required.every((permission) => available.has(permission));
}
