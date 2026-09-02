/**
 * Capacidades de COMÉRCIO — o que o cliente já comprou e o que existe à venda.
 *
 * Ficou de fora do épico até ser cobrado, e era a lacuna mais direta do pilar 1:
 * um agente de vendas que não enxerga o catálogo nem o histórico de pedidos
 * negocia no escuro — promete o que não existe, ou repete uma oferta que o
 * cliente já comprou.
 *
 * Service role bypassa RLS: TODA query filtra `organization_id` manualmente, e a
 * fonte é sempre `ctx.organizationId` (token/cookie), NUNCA o input.
 */
import { z } from "zod";

import type { McpToolDefinition } from "../types";

// ---------------------------------------------------------------------------
// pedidos de um cliente
// ---------------------------------------------------------------------------

const pedidosInputShape = {
  contact_id: z.string().uuid().describe("O cliente cujos pedidos se quer ver."),
  limite: z.number().int().min(1).max(20).optional().default(10),
};

export const crmListContactOrders: McpToolDefinition<typeof pedidosInputShape> = {
  name: "crm_list_contact_orders",
  description:
    "Lista os pedidos de um contato, do mais recente para o mais antigo, com status, valor, " +
    "forma de pagamento, situação de entrega e código de rastreio. Use antes de prometer prazo " +
    "ou repetir oferta: o cliente pode já ter comprado.",
  inputSchema: pedidosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("orders")
      .select(
        "id, external_id, external_provider, status, total_cents, currency, payment_method, fulfillment_status, tracking_code, ordered_at, is_anonymized",
      )
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", input.contact_id)
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .limit(input.limite);

    if (error) throw new Error(`listar_pedidos_falhou: ${error.message}`);

    return {
      pedidos: (data ?? []).map((p) => ({
        ...p,
        // Pedido anonimizado por LGPD continua contando para histórico, mas o
        // conteúdo não volta: dizer isso é melhor que devolver campos vazios e
        // deixar o modelo concluir que o cliente nunca comprou.
        ...(p.is_anonymized ? { aviso: "pedido anonimizado a pedido do titular" } : {}),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// buscar no catálogo
// ---------------------------------------------------------------------------

const produtosInputShape = {
  termo: z.string().trim().min(2).describe("Parte do nome do produto."),
  limite: z.number().int().min(1).max(20).optional().default(10),
  somente_disponiveis: z.boolean().optional().default(true),
};

export const crmSearchProducts: McpToolDefinition<typeof produtosInputShape> = {
  name: "crm_search_products",
  description:
    "Busca produtos do catálogo da loja por parte do nome. Devolve preço, quantidade disponível " +
    "e link. Use para responder preço e disponibilidade com o dado da loja em vez de estimar.",
  inputSchema: produtosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("nuvemshop_products")
      .select("id, external_id, title, description, price_cents, available_qty, url, image_url")
      .eq("organization_id", ctx.organizationId)
      .ilike("title", `%${input.termo}%`)
      .limit(input.limite);

    // Oferecer o que está sem estoque é pior que não achar: o cliente ouve um
    // sim e recebe um não depois.
    if (input.somente_disponiveis) q = q.gt("available_qty", 0);

    const { data, error } = await q;
    if (error) throw new Error(`buscar_produtos_falhou: ${error.message}`);

    return {
      produtos: data ?? [],
      ...(data && data.length === 0
        ? { aviso: input.somente_disponiveis ? "nada com esse nome em estoque" : "nada com esse nome no catálogo" }
        : {}),
    };
  },
};

// ---------------------------------------------------------------------------
// estoque de veículos (Nilson Veículos — Sanity CMS do site)
// ---------------------------------------------------------------------------
//
// O estoque real mora no Sanity do site (nilsonveiculos.vercel.app), não no
// banco do CRM. É um dataset PÚBLICO de leitura (GROQ HTTP API, sem chave),
// então a consulta é ao vivo em vez de sincronizada — não há pipeline de
// sync porque, na escala atual (poucas unidades), sincronizar seria mais
// infra do que o problema pede. Se o estoque crescer muito, revisar para um
// job periódico que grava numa tabela própria do CRM.

const SANITY_PROJECT_ID = "acz11acn";
const SANITY_DATASET = "production";
const SANITY_API_VERSION = "v2021-10-21";
const SANITY_TIMEOUT_MS = 5000;

async function consultarSanity(groq: string, params: Record<string, string> = {}): Promise<unknown[]> {
  const url = new URL(
    `https://${SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${SANITY_DATASET}`,
  );
  url.searchParams.set("query", groq);
  for (const [chave, valor] of Object.entries(params)) {
    url.searchParams.set(`$${chave}`, JSON.stringify(valor));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SANITY_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`sanity_status_${res.status}`);
    const json = (await res.json()) as { result?: unknown[] };
    return json.result ?? [];
  } finally {
    clearTimeout(t);
  }
}

const veiculosInputShape = {
  termo: z
    .string()
    .trim()
    .min(2)
    .optional()
    .describe("Marca ou modelo do veículo (ex.: 'Audi', 'A3'). Deixe vazio para ver todo o estoque."),
  limite: z.number().int().min(1).max(20).optional().default(10),
  somente_disponiveis: z.boolean().optional().default(true),
};

export const crmSearchVehicles: McpToolDefinition<typeof veiculosInputShape> = {
  name: "crm_search_vehicles",
  description:
    "Busca veículos no estoque real da loja (marca, modelo, ano, km, preço, cor, opcionais, foto). " +
    "Use para responder o que tem disponível e o preço com o dado real do estoque em vez de estimar.",
  inputSchema: veiculosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input) => {
    const filtros = ['_type == "vehicle"'];
    if (input.somente_disponiveis) filtros.push('status == "Disponível"');
    if (input.termo) filtros.push("(brand match $termo || model match $termo || version match $termo)");

    const groq = `*[${filtros.join(" && ")}] | order(_createdAt desc) [0...${input.limite}] {
      brand, model, version, year, modelYear, km, price, status, color, fuel, transmission, bodyType, doors,
      highlights, optionals, "slug": slug.current, "imageUrl": images[0].asset->url
    }`;

    let veiculos: unknown[];
    try {
      veiculos = await consultarSanity(groq, input.termo ? { termo: `${input.termo}*` } : {});
    } catch (err) {
      throw new Error(`buscar_veiculos_falhou: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      veiculos,
      ...(veiculos.length === 0 ? { aviso: "nada no estoque com esse critério" } : {}),
    };
  },
};
