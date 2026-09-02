/**
 * POST /api/v1/prospeccao/sync — recebe os resultados de uma execução do
 * squad Opensquad (leads priorizados + mensagens de abordagem) e grava no
 * banco do CRM.
 *
 * Auth: Bearer token de `api_tokens` (mesmo mecanismo do MCP — ver
 * `lib/mcp/auth.ts`), exigindo o escopo `prospeccao:write`. NÃO é sessão de
 * usuário: quem chama é um processo do Claude Code rodando localmente, sem
 * login no CRM.
 *
 * A organização é a do TOKEN (`api_tokens.organization_id`), nunca do body —
 * um token só existe atrelado a uma organização, então não há campo
 * `organization_id` para hardcodar nem para o chamador poder forjar.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  run: z.object({
    runId: z.string().trim().min(1).max(200),
    tema: z.string().trim().max(500).optional(),
    resultado: z.string().max(20_000).optional(),
  }),
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(300),
        content: z.string().max(2_000_000),
      }),
    )
    .max(50)
    .default([]),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  let auth;
  try {
    auth = await validateBearerToken(req.headers.get("authorization"));
  } catch (err) {
    if (err instanceof McpAuthError) {
      return fail("unauthenticated", err.message, err.httpStatus, { requestId });
    }
    throw err;
  }

  if (!auth.scopes.includes("prospeccao:write")) {
    return fail("forbidden", "Token sem o escopo prospeccao:write.", 403, { requestId });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const { run, files } = parsed.data;
  const admin = createAdminClient();

  const { error: runError } = await admin.from("prospeccao_runs").upsert(
    {
      organization_id: auth.organizationId,
      run_id: run.runId,
      tema: run.tema ?? null,
      resultado: run.resultado ?? null,
    },
    { onConflict: "organization_id,run_id" },
  );
  if (runError) {
    return fail("internal_error", `gravar_run_falhou: ${runError.message}`, 500, { requestId });
  }

  if (files.length > 0) {
    const linhas = files.map((f) => ({
      organization_id: auth.organizationId,
      run_id: run.runId,
      filename: f.filename,
      content: f.content,
    }));
    const { error: filesError } = await admin
      .from("prospeccao_results")
      .upsert(linhas, { onConflict: "organization_id,run_id,filename" });
    if (filesError) {
      return fail("internal_error", `gravar_arquivos_falhou: ${filesError.message}`, 500, { requestId });
    }
  }

  return ok({ run_id: run.runId, files_synced: files.length }, { requestId });
}
