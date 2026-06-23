import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Splat (catch-all) route. Any URL under /dashboard/* that doesn't match a
 * concrete route lands here, so unknown URLs render an in-shell 404 instead
 * of TanStack's default blank screen.
 */
export const Route = createFileRoute("/_authenticated/dashboard/$")({
  head: () => ({ meta: [{ title: "Página não encontrada — FlowChat" }] }),
  component: DashboardNotFound,
});

function DashboardNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço acessado não existe ou foi removido. Volte ao painel para
          continuar.
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard">Ir para conversas</Link>
        </Button>
      </div>
    </div>
  );
}
