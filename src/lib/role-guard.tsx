import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSession,
  type AppRole,
  type SessionState,
} from "@/lib/auth";

/**
 * Pure role-check used both at runtime and in tests.
 * `allowed` lists the roles that grant access. Superadmin always passes.
 */
export function roleAllows(userRoles: AppRole[], allowed: AppRole[]): boolean {
  if (userRoles.includes("superadmin")) return true;
  return allowed.some((r) => userRoles.includes(r));
}

interface RoleGuardProps {
  allow: AppRole[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Client-side authorization gate. Auth (is the user signed in?) is enforced by
 * the `_authenticated` layout. This guard enforces authorization — does this
 * signed-in user have the role required to view the page?
 *
 * Roles aren't in the JWT, so we must wait for the profile/roles to load
 * before deciding. While loading we render a neutral placeholder rather than
 * flashing the "forbidden" UI.
 */
export function RoleGuard({ allow, children, fallback }: RoleGuardProps) {
  const session = useSession();

  if (session.loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!roleAllows(session.roles, allow)) {
    return fallback ?? <ForbiddenScreen allowed={allow} session={session} />;
  }

  return <>{children}</>;
}

function ForbiddenScreen({
  allowed,
  session,
}: {
  allowed: AppRole[];
  session: SessionState;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página é para perfis: <strong>{allowed.join(", ")}</strong>. Seus
          papéis: <strong>{session.roles.join(", ") || "—"}</strong>.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Voltar ao painel</Link>
        </Button>
      </div>
    </div>
  );
}
