import { describe, expect, test } from "bun:test";

import { adminReasonOf, grantsAdministrator, isWorkspaceAdmin, type AdminPolicy } from "@/lib/auth/admin";

const policy: AdminPolicy = {
  adminRoleIdentifiers: ["1538740046822117416"],
  discordAdministratorRoleIdentifiers: ["900000000000000001"],
  discordOwnerIdentifier: "913766822682185758",
};

const member = (overrides: Partial<Parameters<typeof adminReasonOf>[0]> = {}) => ({
  isAdmin: false,
  discordUserIdentifier: "1",
  discordRoleIdentifiers: [] as readonly string[],
  ...overrides,
});

describe("who is an admin", () => {
  test("follows the Discord server before anything granted here", () => {
    expect(adminReasonOf(member({ discordUserIdentifier: "913766822682185758" }), policy)).toBe("owner");
    expect(adminReasonOf(member({ discordRoleIdentifiers: ["900000000000000001"] }), policy)).toBe("administrator_role");
    expect(adminReasonOf(member({ discordRoleIdentifiers: ["1538740046822117416"] }), policy)).toBe("admin_role");
    expect(adminReasonOf(member({ isAdmin: true }), policy)).toBe("granted");
    expect(adminReasonOf(member(), policy)).toBeNull();
  });

  test("ignores roles the workspace does not list", () => {
    expect(isWorkspaceAdmin(member({ discordRoleIdentifiers: ["777", "888"] }), policy)).toBe(false);
  });

  // A member with no Discord identity must never match a workspace that has
  // not learned its owner yet, or everyone would be an admin.
  test("does not match an unknown owner against an unlinked member", () => {
    const unknownOwner: AdminPolicy = { ...policy, discordOwnerIdentifier: null };
    expect(isWorkspaceAdmin(member({ discordUserIdentifier: null }), unknownOwner)).toBe(false);
  });

  test("reads Discord's Administrator bit out of the permission bitfield", () => {
    const role = (permissions: string) => ({ id: "1", name: "r", color: 0, position: 1, permissions });
    expect(grantsAdministrator(role("8"))).toBe(true);
    expect(grantsAdministrator(role("2199023255551"))).toBe(true);
    expect(grantsAdministrator(role("0"))).toBe(false);
    expect(grantsAdministrator(role("2048"))).toBe(false);
    // 2^60 + 8: the bit survives only because the field is read as a bigint —
    // as a double, 2^60 + 8 rounds back down to 2^60 and the bit disappears.
    expect(Number("1152921504606846984")).toBe(Number("1152921504606846976"));
    expect(grantsAdministrator(role("1152921504606846984"))).toBe(true);
    expect(grantsAdministrator(role("1152921504606846976"))).toBe(false);
    expect(grantsAdministrator(role("not a number"))).toBe(false);
  });
});
