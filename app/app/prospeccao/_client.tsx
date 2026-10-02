"use client";

import { useState } from "react";
import { toast } from "sonner";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENTES_DO_SQUAD } from "./_agentes";

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

/**
 * Componentes customizados pro markdown gerado pelo squad em vez do plugin
 * `@tailwindcss/typography`: o "prose" dele traz uma paleta própria que não
 * bate com os tokens deste design system (--color-border, --color-text etc.),
 * e reescrever o tema do plugin seria mais código do que estes overrides.
 */
const markdownComponents: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-medium first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded-sm bg-surface-elevated px-1 py-0.5 text-xs">{children}</code>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-elevated">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
  tr: ({ children }) => <tr className="last:[&>td]:border-b-0">{children}</tr>,
};

function copiar(texto: string) {
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success("Comando copiado."))
    .catch(() => toast.error("Não consegui copiar — selecione e copie manualmente."));
}

const SQUAD_PADRAO = "prospeccao-canoas-poa";

function AbaAgentes() {
  return (
    <div className="flex flex-col gap-3">
      {AGENTES_DO_SQUAD.map((agente) => (
        <div key={agente.ordem} className="flex gap-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
            {agente.ordem}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{agente.emoji}</span>
              <h3 className="font-semibold">{agente.nome}</h3>
              <span className="text-sm text-muted-foreground">— {agente.papel}</span>
              <span
                className={
                  "ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium " +
                  (agente.execucao === "assincrona"
                    ? "bg-info-bg text-info-fg"
                    : "bg-accent-soft text-accent")
                }
              >
                {agente.execucao === "assincrona" ? "assíncrona" : "inline"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{agente.descricao}</p>
            {agente.skills && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {agente.skills.map((skill) => (
                  <code key={skill} className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-xs">
                    {skill}
                  </code>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const BOTOES_RAPIDOS = [
  { label: "Rodar squad", comando: `/opensquad run ${SQUAD_PADRAO}` },
  { label: "Editar squad", comando: `/opensquad edit ${SQUAD_PADRAO}` },
  { label: "Ver squads", comando: "/opensquad list" },
  { label: "Ajuda", comando: "/opensquad help" },
];

function AbaComandos() {
  const [tipo, setTipo] = useState<"run" | "edit">("run");
  const [squad, setSquad] = useState(SQUAD_PADRAO);
  const [pedido, setPedido] = useState("");
  const [gerado, setGerado] = useState<string | null>(null);

  function gerar() {
    const base = `/opensquad ${tipo} ${squad.trim() || SQUAD_PADRAO}`;
    const comando = tipo === "edit" && pedido.trim() ? `${base} ${pedido.trim()}` : base;
    setGerado(comando);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Atalhos</h3>
        <div className="flex flex-wrap gap-2">
          {BOTOES_RAPIDOS.map((b) => (
            <Button key={b.label} variant="secondary" size="sm" onClick={() => copiar(b.comando)}>
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Montar comando</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="w-32">
              <Select value={tipo} onValueChange={(v) => setTipo(v as "run" | "edit")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="run">run</SelectItem>
                  <SelectItem value="edit">edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input
              value={squad}
              onChange={(e) => setSquad(e.target.value)}
              placeholder="nome do squad"
              className="h-10 flex-1 rounded-sm border border-border bg-bg px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-hidden focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-soft"
            />
          </div>
          <Textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder="Solicitação livre (usada em 'edit' — ex.: incluir bairro Passo D'Areia no raio de busca)"
            rows={3}
          />
          <div>
            <Button onClick={gerar}>Gerar comando</Button>
          </div>
        </div>

        {gerado && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-pre text-sm">{gerado}</code>
            <Button variant="ghost" size="sm" onClick={() => copiar(gerado)}>
              Copiar
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Esta aba só monta o texto do comando — copie e cole no Claude Code rodando localmente. Nada aqui
        chama o squad.
      </p>
    </div>
  );
}

function AbaResultados({
  runs,
  resultsByRun,
}: {
  runs: ProspeccaoRun[];
  resultsByRun: Map<string, ProspeccaoResult[]>;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Nenhuma execução sincronizada ainda.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {runs.map((run) => (
        <section key={run.id} className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h2 className="text-lg font-semibold">{run.tema ?? run.run_id}</h2>
              <p className="text-xs text-muted-foreground">
                {run.run_id} · {new Date(run.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
            {run.resultado && (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                {run.resultado}
              </span>
            )}
          </div>

          {(resultsByRun.get(run.run_id) ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem arquivos de resultado nesta execução.</p>
          ) : (
            (resultsByRun.get(run.run_id) ?? []).map((file) => (
              <details key={file.id} className="mb-3 last:mb-0" open>
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {file.filename}
                </summary>
                <div className="mt-2">
                  <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {file.content}
                  </Markdown>
                </div>
              </details>
            ))
          )}
        </section>
      ))}
    </div>
  );
}

export function ProspeccaoClient({
  runs,
  resultsByRun,
}: {
  runs: ProspeccaoRun[];
  resultsByRun: Map<string, ProspeccaoResult[]>;
}) {
  return (
    <Tabs defaultValue="resultados">
      <TabsList>
        <TabsTrigger value="agentes">Agentes</TabsTrigger>
        <TabsTrigger value="comandos">Comandos</TabsTrigger>
        <TabsTrigger value="resultados">Resultados</TabsTrigger>
      </TabsList>
      <TabsContent value="agentes">
        <AbaAgentes />
      </TabsContent>
      <TabsContent value="comandos">
        <AbaComandos />
      </TabsContent>
      <TabsContent value="resultados">
        <AbaResultados runs={runs} resultsByRun={resultsByRun} />
      </TabsContent>
    </Tabs>
  );
}
