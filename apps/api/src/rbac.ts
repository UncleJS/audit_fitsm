export const roleHierarchy = ["viewer", "auditor", "lead_auditor", "org_admin", "system_admin"] as const;

export type RoleCode = (typeof roleHierarchy)[number];

export const hasRole = (roles: string[], required: RoleCode): boolean => {
  const requiredIndex = roleHierarchy.indexOf(required);
  return roles.some((role) => roleHierarchy.indexOf(role as RoleCode) >= requiredIndex);
};
