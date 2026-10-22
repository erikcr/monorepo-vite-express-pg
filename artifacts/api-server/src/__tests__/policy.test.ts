import { describe, expect, it } from "vitest";
import {
  isOrgRole,
  isStaffRole,
  ORG_PERMISSIONS,
  orgPermissions,
  STAFF_PERMISSIONS,
  staffPermissions,
} from "../lib/authz/policy.js";

// The whole matrix, cell by cell: changing what a role can do should be a deliberate edit here.
describe("permission policy", () => {
  it("org roles", () => {
    expect(orgPermissions("org_admin")).toEqual(ORG_PERMISSIONS);
    expect(orgPermissions("org_member")).toEqual(["example.read", "example.write", "org.leave"]);
    expect(ORG_PERMISSIONS).toEqual([
      "example.read",
      "example.write",
      "org.settings.write",
      "org.delete",
      "org.leave",
    ]);
  });

  it("staff roles", () => {
    expect(staffPermissions("staff_admin")).toEqual(STAFF_PERMISSIONS);
    expect(staffPermissions("staff_support")).toEqual(["platform.orgs.read"]);
  });

  it("unknown roles grant nothing", () => {
    expect(isOrgRole("owner")).toBe(false);
    expect(isOrgRole("toString")).toBe(false); // not fooled by Object.prototype
    expect(isStaffRole("org_admin")).toBe(false);
  });
});
