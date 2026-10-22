// The one permission policy: which role may do what. Routes declare a permission
// (`requireOrg("example.write")`) and never test a role, so changing what a role can do is an
// edit here. Every role/permission pair is covered by src/__tests__/policy.test.ts.

export const ORG_PERMISSIONS = [
  "example.read",
  "example.write",
  "org.settings.write",
  "org.delete",
  "org.leave",
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

const ORG_POLICY = {
  org_admin: ORG_PERMISSIONS,
  org_member: ["example.read", "example.write", "org.leave"],
} as const satisfies Record<string, readonly OrgPermission[]>;
export type OrgRole = keyof typeof ORG_POLICY;

/** Staff permissions on the admin API (/api/admin). */
export const STAFF_PERMISSIONS = ["platform.orgs.read", "platform.staff.manage"] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

const STAFF_POLICY = {
  staff_admin: STAFF_PERMISSIONS,
  staff_support: ["platform.orgs.read"],
} as const satisfies Record<string, readonly StaffPermission[]>;
export type StaffRole = keyof typeof STAFF_POLICY;

// Roles are stored as text; an unknown role (typo, retired role) grants nothing.
export const isOrgRole = (role: string): role is OrgRole => Object.hasOwn(ORG_POLICY, role);
export const isStaffRole = (role: string): role is StaffRole => Object.hasOwn(STAFF_POLICY, role);

export const orgPermissions = (role: OrgRole): readonly OrgPermission[] => ORG_POLICY[role];
export const staffPermissions = (role: StaffRole): readonly StaffPermission[] => STAFF_POLICY[role];
