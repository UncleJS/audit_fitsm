import { describe, expect, it } from "bun:test";
import { hasRole } from "./rbac";

describe("hasRole", () => {
  it("accepts the required role and higher roles", () => {
    expect(hasRole(["auditor"], "auditor")).toBe(true);
    expect(hasRole(["lead_auditor"], "auditor")).toBe(true);
    expect(hasRole(["system_admin"], "org_admin")).toBe(true);
  });

  it("rejects a lower role", () => {
    expect(hasRole(["viewer"], "auditor")).toBe(false);
    expect(hasRole([], "viewer")).toBe(false);
  });
});
