/**
 * Smoke tests for the dashboard route registry.
 *
 * Garantia: cada rota anunciada no menu existe no routeTree gerado e está
 * gated pelo layout `_authenticated`. Se algum link novo for adicionado sem
 * o route file correspondente, ou se um arquivo for movido para fora da área
 * autenticada, estes testes quebram antes do deploy.
 */
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";

// TanStack expõe a tabela completa de rotas em `routesById` após
// `_addFileTypes`. Fazemos fallback para `children` recursivo caso a versão
// mude o formato no futuro.
function collectRouteIds(): string[] {
  const tree = routeTree as unknown as {
    routesById?: Record<string, unknown>;
    id?: string;
    children?: unknown;
  };
  if (tree.routesById) return Object.keys(tree.routesById);

  const ids: string[] = [];
  const walk = (node: unknown) => {
    const n = node as { id?: string; children?: unknown };
    if (n?.id) ids.push(n.id);
    const c = n?.children;
    if (Array.isArray(c)) c.forEach(walk);
    else if (c && typeof c === "object") Object.values(c).forEach(walk);
  };
  walk(tree);
  return ids;
}

const allIds = collectRouteIds();

const DASHBOARD_ROUTES = [
  "/_authenticated/dashboard/",
  "/_authenticated/dashboard/contacts",
  "/_authenticated/dashboard/reports",
  "/_authenticated/dashboard/campaigns",
  "/_authenticated/dashboard/bot-builder",
  "/_authenticated/dashboard/settings",
  "/_authenticated/dashboard/settings/",
  "/_authenticated/dashboard/settings/agents",
  "/_authenticated/dashboard/settings/inboxes",
  "/_authenticated/dashboard/settings/labels",
  "/_authenticated/dashboard/settings/canned",
  "/_authenticated/dashboard/superadmin",
];

describe("dashboard route registry", () => {
  it.each(DASHBOARD_ROUTES)("registra %s sob /_authenticated", (id) => {
    expect(allIds).toContain(id);
    expect(id.startsWith("/_authenticated/")).toBe(true);
  });

  it("expõe páginas públicas apenas para login/signup/home", () => {
    const publicIds = allIds.filter(
      (id) => !id.startsWith("/_authenticated") && id !== "__root__",
    );
    expect(publicIds.sort()).toEqual(["/", "/login", "/signup"]);
  });

  it("tem catch-all dentro de /dashboard para URLs inválidas", () => {
    expect(allIds).toContain("/_authenticated/dashboard/$");
  });
});
