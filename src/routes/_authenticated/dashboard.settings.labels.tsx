import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdminOrManager } from "@/lib/auth";

import { RoleGuard } from "@/lib/role-guard";

export const Route = createFileRoute("/_authenticated/dashboard/settings/labels")({
  component: () => (
    <RoleGuard allow={["admin", "gerente"]}>
      <LabelsPage />
    </RoleGuard>
  ),
});

function LabelsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdminOrManager(session.roles);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2563eb");

  const { data: labels = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("labels").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function create() {
    if (!name || !session.profile?.tenant_id) return;
    const { error } = await supabase.from("labels").insert({
      tenant_id: session.profile.tenant_id,
      name,
      color,
    });
    if (error) return toast.error(error.message);
    setName("");
    queryClient.invalidateQueries({ queryKey: ["labels"] });
    toast.success("Label criada");
  }
  async function remove(id: string) {
    const { error } = await supabase.from("labels").delete().eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["labels"] });
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Labels</h1>
      <p className="mt-1 text-sm text-muted-foreground">Categorize suas conversas</p>
      {canEdit && (
        <div className="mt-6 flex max-w-xl items-end gap-2">
          <div className="flex-1">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Ex: VIP" />
          </div>
          <div>
            <Label>Cor</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-10 w-16 cursor-pointer p-1" />
          </div>
          <Button onClick={create} className="gap-1.5"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {labels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
            style={{ borderColor: l.color, color: l.color }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.name}
            {canEdit && (
              <button onClick={() => remove(l.id)} className="opacity-50 hover:opacity-100">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {labels.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma label.</p>}
      </div>
    </div>
  );
}
