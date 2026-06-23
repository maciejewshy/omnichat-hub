import { describe, expect, it } from "vitest";
import {
  hasRole,
  isAdmin,
  isAdminOrManager,
  highestRoleLabel,
  type AppRole,
} from "@/lib/auth";
import { roleAllows } from "@/lib/role-guard";

describe("role helpers", () => {
  it("hasRole detects membership", () => {
    expect(hasRole(["agente"], "agente")).toBe(true);
    expect(hasRole(["agente"], "admin")).toBe(false);
  });

  it("isAdmin matches admin and superadmin only", () => {
    expect(isAdmin(["admin"])).toBe(true);
    expect(isAdmin(["superadmin"])).toBe(true);
    expect(isAdmin(["gerente"])).toBe(false);
    expect(isAdmin(["agente"])).toBe(false);
    expect(isAdmin([])).toBe(false);
  });

  it("isAdminOrManager includes gerente", () => {
    expect(isAdminOrManager(["gerente"])).toBe(true);
    expect(isAdminOrManager(["admin"])).toBe(true);
    expect(isAdminOrManager(["agente"])).toBe(false);
  });

  it("highestRoleLabel picks the strongest role", () => {
    expect(highestRoleLabel(["agente", "admin"])).toBe("Admin");
    expect(highestRoleLabel(["agente", "gerente"])).toBe("Gerente");
    expect(highestRoleLabel(["agente"])).toBe("Agente");
    expect(highestRoleLabel(["superadmin", "admin"])).toBe("Superadmin");
    expect(highestRoleLabel([])).toBe("Membro");
  });
});

describe("roleAllows (RoleGuard logic)", () => {
  const cases: Array<{
    name: string;
    user: AppRole[];
    allow: AppRole[];
    expect: boolean;
  }> = [
    { name: "agente vê página de agente", user: ["agente"], allow: ["agente"], expect: true },
    { name: "agente bloqueado de página admin", user: ["agente"], allow: ["admin"], expect: false },
    { name: "gerente vê página de gerente+admin", user: ["gerente"], allow: ["admin", "gerente"], expect: true },
    { name: "admin vê tudo permitido", user: ["admin"], allow: ["admin"], expect: true },
    { name: "superadmin entra em qualquer página", user: ["superadmin"], allow: ["admin"], expect: true },
    { name: "sessão sem roles é bloqueada", user: [], allow: ["agente"], expect: false },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(roleAllows(c.user, c.allow)).toBe(c.expect);
    });
  }
});
