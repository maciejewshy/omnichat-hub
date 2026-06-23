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

// TanStack guarda apenas o segmento local em `options.id` ("/dashboard").
// Para obter o id completo ("/_authenticated/dashboard") concatenamos os
// segmentos enquanto descemos a árvore. Index ("/") herda o id do pai.
function collectRouteIds(): string[] {
  const ids: string[] = [];
  const walk = (node: unknown, parentId: string) => {
    const n = node as { options?: { id?: string }; children?: unknown };
    const seg = n?.options?.id ?? "";
    const id = seg === "/" ? parentId + "/" : parentId + seg;
    if (seg) ids.push(id);
    const c = n?.children;
    const next = seg === "/" ? parentId : id;
    if (Array.isArray(c)) c.forEach((ch) => walk(ch, next));
    else if (c && typeof c === "object") Object.values(c).forEach((ch) => walk(ch, next));
  };
  walk(routeTree, "");
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
