import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useSession, isAdminOrManager } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard/settings/canned")({
  component: CannedPage,
});

function CannedPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canEdit = isAdminOrManager(session.roles);
  const [code, setCode] = useState("");
  const [content, setContent] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["canned"],
    queryFn: async () => {
      const { data, error } = await supabase.from("canned_responses").select("*").order("short_code");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function create() {
    if (!code || !content || !session.profile?.tenant_id) return;
    const { error } = await supabase.from("canned_responses").insert({
      tenant_id: session.profile.tenant_id,
      short_code: code,
      content,
    });
    if (error) return toast.error(error.message);
    setCode("");
    setContent("");
    queryClient.invalidateQueries({ queryKey: ["canned"] });
    toast.success("Resposta rápida criada");
  }
  async function remove(id: string) {
    await supabase.from("canned_responses").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["canned"] });
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Respostas rápidas</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use no chat com /atalho</p>
      {canEdit && (
        <Card className="mt-6 max-w-2xl">
          <CardContent className="space-y-3 pt-6">
            <div>
              <Label>Atalho</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1" placeholder="ex: ola" />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1" rows={3} />
            </div>
            <Button onClick={create} className="gap-1.5"><Plus className="h-4 w-4" /> Adicionar</Button>
          </CardContent>
        </Card>
      )}
      <div className="mt-6 max-w-2xl space-y-2">
        {items.map((r) => (
          <div key={r.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Zap className="mt-0.5 h-4 w-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">/{r.short_code}</p>
              <p className="mt-1 text-sm text-muted-foreground">{r.content}</p>
            </div>
            {canEdit && (
              <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
