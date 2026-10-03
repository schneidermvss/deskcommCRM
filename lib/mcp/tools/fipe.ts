/**
 * Consulta de preço de referência na Tabela FIPE — útil pra qualquer negócio
 * que compra, vende ou avalia veículo usado (revenda, troca, financiamento).
 *
 * Fonte: API pública da FIPE (fipe.parallelum.com.br/api/v2), mantida pela
 * comunidade, sem chave obrigatória — 500 consultas/dia por IP. Com
 * `FIPE_API_TOKEN` (grátis em fipe.online) sobe pra 1000/dia; ausente, a
 * ferramenta simplesmente usa o limite sem token. Nenhuma credencial do
 * cliente é exigida — não é dado sensível, é preço de tabela público.
 *
 * Não tem organization_id nem toca o banco: é referência externa, igual a
 * `crm_search_vehicles` consultando o Sanity. Por isso não precisa de
 * `ctx.supabase` no handler.
 */
import { z } from "zod";

import { env } from "@/lib/env";
import type { McpToolDefinition } from "../types";

const FIPE_BASE_URL = "https://fipe.parallelum.com.br/api/v2";
const FIPE_TIMEOUT_MS = 8000;

type TipoVeiculoFipe = "cars" | "motorcycles" | "trucks";

interface FipeBrand {
  code: string;
  name: string;
}
interface FipeModel {
  code: string;
  name: string;
}
interface FipeYear {
  code: string;
  name: string;
}
interface FipePrice {
  vehicleType: number;
  price: string;
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  codeFipe: string;
  referenceMonth: string;
  fuelAcronym: string;
}

async function fipeFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (env.FIPE_API_TOKEN) headers["X-Subscription-Token"] = env.FIPE_API_TOKEN;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FIPE_TIMEOUT_MS);
  try {
    const res = await fetch(`${FIPE_BASE_URL}${path}`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`fipe_status_${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Sem acento, minúsculo, sem espaço duplo — pra comparar "Volkswagen" com "VW - VolksWagen". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Melhor correspondência por inclusão de token — não é fuzzy matching de
 * verdade (sem biblioteca nova pra um caso só), mas resolve "gol" achando
 * "GOL 1.0", "VW GOL" etc. Quando mais de uma opção bate igualmente bem, a
 * função devolve TODAS como empate, e quem chama pede desambiguação em vez
 * de adivinhar — errar o modelo erra o preço inteiro.
 */
function melhoresCorrespondencias<T extends { name: string }>(lista: T[], termo: string): T[] {
  const alvo = normalizar(termo);
  if (!alvo) return [];
  const exatas = lista.filter((item) => normalizar(item.name) === alvo);
  if (exatas.length > 0) return exatas;
  const porInclusao = lista.filter((item) => normalizar(item.name).includes(alvo));
  if (porInclusao.length > 0) return porInclusao;
  // Nenhuma inclusão direta: tenta pela palavra mais específica do termo (a
  // mais longa), pro caso de o termo ter ruído ("novo gol 2020" → "gol").
  const palavras = alvo.split(" ").sort((a, b) => b.length - a.length);
  for (const palavra of palavras) {
    if (palavra.length < 3) continue;
    const achadas = lista.filter((item) => normalizar(item.name).includes(palavra));
    if (achadas.length > 0) return achadas;
  }
  return [];
}

const TIPOS_FIPE: Record<string, TipoVeiculoFipe> = {
  carro: "cars",
  carros: "cars",
  moto: "motorcycles",
  motos: "motorcycles",
  motocicleta: "motorcycles",
  caminhao: "trucks",
  caminhão: "trucks",
  caminhoes: "trucks",
  caminhões: "trucks",
};

const fipeInputShape = {
  marca: z.string().trim().min(1).max(60).describe("Marca do veículo, ex.: 'Volkswagen', 'Fiat', 'Honda'."),
  modelo: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("Modelo ou parte do nome do modelo, ex.: 'Gol', 'Onix LT', 'Corolla'."),
  ano_modelo: z.number().int().min(1950).max(2100).describe("Ano-modelo do veículo (não o ano de fabricação, quando diferirem)."),
  tipo: z
    .enum(["carro", "moto", "caminhao"])
    .optional()
    .default("carro")
    .describe("Tipo de veículo. Default 'carro'."),
};

export const crmLookupFipePrice: McpToolDefinition<typeof fipeInputShape> = {
  name: "crm_lookup_fipe_price",
  description:
    "Consulta o preço de referência da Tabela FIPE pra um veículo (marca, modelo, ano), pra responder " +
    "com o valor de mercado de tabela em vez de estimar — útil pra avaliar veículo de troca ou justificar " +
    "proposta. Quando marca ou modelo são ambíguos (mais de uma opção bate), devolve as opções em vez de " +
    "adivinhar; chame de novo com o nome mais específico.",
  inputSchema: fipeInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input) => {
    const tipo = TIPOS_FIPE[input.tipo] ?? "cars";

    let marcas: FipeBrand[];
    try {
      marcas = await fipeFetch<FipeBrand[]>(`/${tipo}/brands`);
    } catch (e) {
      return { erro: `fipe_indisponivel: ${e instanceof Error ? e.message : String(e)}` };
    }
    const marcasAchadas = melhoresCorrespondencias(marcas, input.marca);
    if (marcasAchadas.length === 0) {
      return { erro: "marca_nao_encontrada", mensagem: `Nenhuma marca na FIPE bate com "${input.marca}".` };
    }
    if (marcasAchadas.length > 1) {
      return {
        precisa_escolher: "marca",
        opcoes: marcasAchadas.slice(0, 10).map((m) => m.name),
      };
    }
    const marca = marcasAchadas[0];
    if (!marca) return { erro: "marca_nao_encontrada" };

    const modelos = await fipeFetch<FipeModel[]>(`/${tipo}/brands/${marca.code}/models`);
    const modelosAchados = melhoresCorrespondencias(modelos, input.modelo);
    if (modelosAchados.length === 0) {
      return {
        erro: "modelo_nao_encontrado",
        mensagem: `Nenhum modelo de ${marca.name} bate com "${input.modelo}".`,
      };
    }
    if (modelosAchados.length > 1) {
      return {
        precisa_escolher: "modelo",
        marca: marca.name,
        opcoes: modelosAchados.slice(0, 10).map((m) => m.name),
      };
    }
    const modelo = modelosAchados[0];
    if (!modelo) return { erro: "modelo_nao_encontrado" };

    const anos = await fipeFetch<FipeYear[]>(`/${tipo}/brands/${marca.code}/models/${modelo.code}/years`);
    // O "code" do ano vem como "2013-3" (ano-modelo + combustível); o ano puro
    // é o prefixo antes do hífen.
    const anosDoModelo = anos.filter((a) => a.code.split("-")[0] === String(input.ano_modelo));
    if (anosDoModelo.length === 0) {
      return {
        erro: "ano_nao_encontrado",
        mensagem: `${marca.name} ${modelo.name} não tem versão ${input.ano_modelo} na FIPE.`,
        anos_disponiveis: Array.from(new Set(anos.map((a) => a.code.split("-")[0]))).slice(0, 15),
      };
    }
    if (anosDoModelo.length > 1) {
      // Mais de um combustível pro mesmo ano (ex.: Flex e Diesel) — desambigua
      // pelo nome completo, que já inclui o combustível.
      return {
        precisa_escolher: "combustivel",
        marca: marca.name,
        modelo: modelo.name,
        opcoes: anosDoModelo.map((a) => a.name),
      };
    }
    const ano = anosDoModelo[0];
    if (!ano) return { erro: "ano_nao_encontrado" };

    const preco = await fipeFetch<FipePrice>(
      `/${tipo}/brands/${marca.code}/models/${modelo.code}/years/${ano.code}`,
    );

    return {
      marca: preco.brand,
      modelo: preco.model,
      ano_modelo: preco.modelYear,
      combustivel: preco.fuel,
      preco_fipe: preco.price,
      codigo_fipe: preco.codeFipe,
      mes_de_referencia: preco.referenceMonth,
    };
  },
};
