import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { ProspeccaoClient } from "./_client";

export const dynamic = "force-dynamic";

interface ProspeccaoRun {
  id: string;
  run_id: string;
  tema: string | null;
  resultado: string | null;
  created_at: string;
}

interface ProspeccaoResult {
  id: string;
  run_id: string;
  filename: string;
  content: string;
  created_at: string;
}

export default async function ProspeccaoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // Só admin: painel operacional interno da AETRIX, não uma tela de operação
  // do dia a dia do cliente.
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) redirect("/app");

  const supabase = await createClient();

  const [{ data: runsData }, { data: resultsData }] = await Promise.all([
    supabase
      .from("prospeccao_runs")
      .select("id, run_id, tema, resultado, created_at")
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("prospeccao_results")
      .select("id, run_id, filename, content, created_at")
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false }),
  ]);

  const runs = (runsData ?? []) as ProspeccaoRun[];
  const results = (resultsData ?? []) as ProspeccaoResult[];

  const resultsByRun = new Map<string, ProspeccaoResult[]>();
  for (const r of results) {
    const lista = resultsByRun.get(r.run_id) ?? [];
    lista.push(r);
    resultsByRun.set(r.run_id, lista);
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="flex items-center gap-3">
        <MagnifyingGlass size={28} className="text-muted-foreground" weight="duotone" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospecção</h1>
          <p className="text-sm text-muted-foreground">
            Squad Opensquad — agentes, comandos e execuções de prospecção de leads.
          </p>
        </div>
      </header>

      <ProspeccaoClient runs={runs} resultsByRun={resultsByRun} />
    </div>
  );
}
