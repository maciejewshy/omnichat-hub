import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdmin } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard/settings/")({
  component: GeneralSettings,
});

function GeneralSettings() {
  const session = useSession();
  const canEdit = isAdmin(session.roles);
  const [name, setName] = useState("");

  useEffect(() => {
    if (session.tenant?.name) setName(session.tenant.name);
  }, [session.tenant?.name]);

  async function save() {
    if (!session.tenant?.id) return;
    const { error } = await supabase.from("tenants").update({ name }).eq("id", session.tenant.id);
    if (error) return toast.error(error.message);
    toast.success("Empresa atualizada");
    session.refresh();
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Configurações gerais</h1>
      <p className="mt-1 text-sm text-muted-foreground">Dados da sua empresa</p>
      <Card className="mt-6 max-w-xl">
        <CardHeader>
          <CardTitle>Empresa</CardTitle>
          <CardDescription>
            Plano: <span className="font-medium">{session.tenant?.plan}</span> · Status:{" "}
            <span className="font-medium">{session.tenant?.status}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nome da empresa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="mt-1" />
          </div>
          {canEdit && <Button onClick={save}>Salvar</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
