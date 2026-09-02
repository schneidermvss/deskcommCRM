/**
 * Os 4 agentes do squad Opensquad — dado ESTÁTICO, não muda por execução.
 * Vem hardcoded (não do banco) porque descreve o PIPELINE, não uma execução
 * dele — o que muda por execução mora em `prospeccao_runs`/`prospeccao_results`.
 */
export interface AgenteDoSquad {
  ordem: number;
  nome: string;
  emoji: string;
  papel: string;
  descricao: string;
  execucao: "assincrona" | "inline";
  skills?: string[];
}

export const AGENTES_DO_SQUAD: AgenteDoSquad[] = [
  {
    ordem: 1,
    nome: "Marcia Mapas",
    emoji: "📍",
    papel: "Pesquisadora de Prospecção",
    descricao:
      "Busca negócios locais no Google Maps dentro dos segmentos-alvo da AETRIX e verifica presença de site e Instagram de cada um.",
    execucao: "assincrona",
    skills: ["web_search", "web_fetch", "apify"],
  },
  {
    ordem: 2,
    nome: "Diego Dados",
    emoji: "📊",
    papel: "Analista de Priorização",
    descricao: "Pontua cada lead pela lacuna de presença digital e monta a tabela final priorizada.",
    execucao: "assincrona",
  },
  {
    ordem: 3,
    nome: "Ana Abordagem",
    emoji: "✉️",
    papel: "Redatora de Prospecção",
    descricao:
      "Escreve a mensagem de primeiro contato personalizada para cada lead priorizado no tom da AETRIX.",
    execucao: "inline",
  },
  {
    ordem: 4,
    nome: "Vera Veredito",
    emoji: "⚖️",
    papel: "Revisora de Qualidade",
    descricao: "Confere a precisão dos dados e a qualidade das mensagens de abordagem antes da entrega final.",
    execucao: "inline",
  },
];
