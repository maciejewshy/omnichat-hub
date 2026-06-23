import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/campaigns")({
  head: () => ({ meta: [{ title: "Campanhas — FlowChat" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Megaphone className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Campanhas em breve</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Disparos em massa segmentados para WhatsApp e Instagram chegam na próxima iteração.
        </p>
      </div>
    </div>
  );
}
