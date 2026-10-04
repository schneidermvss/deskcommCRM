import { nomesDasFerramentas } from "../guardrails/before-send";

/**
 * Bloco de sistema RESIDENTE da Agenda — entra no prefixo cacheável sempre que o
 * agente tem `crm_book_appointment` no `tool_ids` publicado, INDEPENDENTE de a skill
 * situacional "agendamento" ter disparado no turno.
 *
 * Por quê: a skill "agendamento" (`lib/agent-engine/agent/skills.ts`) só injeta o
 * corpo dela quando a ÚLTIMA mensagem inbound do turno bate uma keyword. Medido
 * neste repo: o turno em que o lead ACEITA um horário oferecido ("pode ser amanhã
 * às 9 então") raramente repete uma keyword de agendar — quem carrega a keyword é o
 * turno ANTERIOR, que já passou. Sem o corpo da skill presente NAQUELE turno
 * específico, o modelo confirmava o compromisso pela conversa, sem nunca chamar
 * `crm_book_appointment` — sentença dita ao cliente, nada gravado no banco. Esta
 * regra é curta, redundante com a skill de propósito e, por só depender de
 * `agentConfig.toolIds` (não da mensagem do turno), fica sempre presente.
 *
 * ⚠️ Segundo parágrafo (2026-08-29): a mesma lacuna de keyword tem um irmão mais
 * barato de cometer. Medido em produção: o lead disse "Pode ser segunda de manha"
 * e depois só "?" — nenhuma das duas bate keyword da skill "agendamento", então o
 * corpo dela (que tem a instrução "chame crm_find_free_slots e leia a resposta")
 * nunca entrou no contexto. O primeiro parágrafo deste bloco só proíbe MENTIR
 * ("confirmado" sem checar) — não obriga a CHECAR. Sem essa obrigação, o modelo
 * tinha uma saída segura e preguiçosa: responder "vou verificar e te aviso" pra
 * sempre, sem nunca chamar a ferramenta. O segundo parágrafo fecha essa saída.
 *
 * ⚠️ Terceiro parágrafo (2026-08-29, mesmo dia): o segundo parágrafo sozinho NÃO
 * bastou — medido no mesmo teste, depois de publicado. Causa raiz achada no
 * `system_prompt` que o PRÓPRIO tenant escreveu para este agente: ele instrui a
 * "encaminhar dúvidas ou situações fora da sua autonomia ao gerente Fulano".
 * O modelo estava classificando "confirmar horário" como uma dessas situações e
 * respondendo "vou confirmar com o Fulano/a equipe" — coerente com a
 * identidade que o tenant deu a ele, só que sem nunca chamar a ferramenta. Um
 * agravante: a MESMA conversa já tinha várias respostas assim ANTES deste fix
 * existir, e o modelo lê o próprio histórico — puxando a resposta pra manter
 * consistência com o que ele mesmo já disse. O terceiro parágrafo nomeia o
 * conflito explicitamente e resolve a favor da ferramenta: checar/marcar
 * agenda com uma tool disponível NUNCA é "fora da autonomia", nem quando o
 * prompt do tenant nomeia um gerente para outras decisões — e ele AINDA vale
 * pra essas outras decisões (aprovar desconto, exceção de política etc.),
 * porque este parágrafo só fala de checar/marcar horário.
 */
function agendaSystemBlock(toolIds: readonly string[]): string {
  // ⚠️ Os nomes de ferramenta deste bloco saem TODOS da lista do PRÓPRIO agente —
  // nenhum vem escrito à mão. Desde a #831 as combinações são muitas (quem tem só a
  // conjunta, quem tem só a avulsa, quem tem as duas, com ou sem a consulta e a
  // remarcação), e um dono aparando capacidades para caber no teto de 25 produz
  // qualquer uma delas. Nomear ferramenta ausente é o modo de falha que o bloco
  // irmão (`AGENDA_CONSULTA_SYSTEM_BLOCK`) existe para evitar: o modelo tenta
  // chamá-la. Uma versão anterior nomeava "`crm_book_appointment` ou
  // `crm_find_and_book_appointment`, a que estiver na sua lista" — e isso ainda
  // ensina o nome de uma ferramenta que o agente não tem.
  const tem = (nome: string): boolean => toolIds.includes(nome);
  const marcar = nomesDasFerramentas(
    ["crm_book_appointment", "crm_find_and_book_appointment"].filter(tem),
  );
  const remarcacao = tem("crm_reschedule_appointment")
    ? " (ou `crm_reschedule_appointment`, para remarcação)"
    : "";

  return (
    "## Agenda — nunca confirme sem checar\n" +
    "Você só pode dizer a um lead que um horário/consulta/visita está confirmado DEPOIS de chamar " +
    `${marcar}${remarcacao} e ver o retorno confirmando o ` +
    "sucesso. Isso vale mesmo quando o lead já aceitou um horário que você ofereceu — aceite verbal não é " +
    'reserva. NUNCA diga "confirmado", "está marcado" ou equivalente baseado só no histórico da conversa. ' +
    // ⚠️ A ressalva é obrigatória: sem ela este parágrafo ENSINA o erro. Num tipo
    // que exige aprovação, marcar devolve `aguarda_confirmacao: true` e o
    // compromisso nasce `pending` — dizer "confirmado" ali é afirmar o que
    // ninguém aprovou, e o cliente aparece num horário que pode ser recusado.
    "⚠️ EXCEÇÃO: se o retorno trouxer `aguarda_confirmacao: true`, o horário foi apenas RESERVADO e " +
    "ainda depende de alguém da equipe aprovar. Nesse caso NÃO diga que está confirmado: diga que " +
    "separou o horário e que a equipe confirma. " +
    "Se ainda não chamou a ferramenta neste turno, chame antes de responder; se a chamada falhar ou você não " +
    "tiver certeza do resultado, diga que vai verificar e NÃO afirme que está confirmado.\n" +
    // Sem a ferramenta que só CONSULTA, este parágrafo não tem o que mandar
    // chamar: mandar chamar uma que MARCA seria mandar reservar um horário que o
    // lead só mencionou. Quem tem a conjunta recebe o parágrafo dela, abaixo, e o
    // gate de agenda continua armado para os dois.
    (tem("crm_find_free_slots")
      ? "Isso NÃO é desculpa para procrastinar: se o lead mencionou (agora ou em qualquer mensagem anterior da " +
        "conversa) um dia/horário específico que ainda não foi checado, chame `crm_find_free_slots` " +
        'NESTE turno antes de responder — não repita "vou verificar/confirmar e te aviso" sem ter chamado a ' +
        'ferramenta. Um "vou verificar" só é aceitável na MESMA resposta em que você já chamou a ferramenta e ' +
        "ela falhou ou não trouxe resultado; nunca como substituto de chamar.\n"
      : "") +
    // Preservar o `inicio` é o contrato de `crm_book_appointment` (`starts_at`). A
    // conjunta recebe dia e hora, não o instante — o parágrafo não se aplica a ela.
    (tem("crm_find_free_slots") && tem("crm_book_appointment")
      ? "Se o lead escolheu um horário que VOCÊ já ofereceu nesta conversa com `crm_find_free_slots`, ele já " +
        "foi checado: preserve o `inicio` que a ferramenta devolveu e chame `crm_book_appointment` " +
        "diretamente. " +
        "NÃO consulte de novo montando datas/horas em UTC; só consulte outra vez se a reserva recusar o horário.\n"
      : "") +
    // Issue #831: consultar e encerrar o turno é o meio-caminho que deixa o lead sem
    // agendamento. Quando a ferramenta conjunta existe, ela é o caminho PREFERIDO —
    // confirmar o horário e gravar deixa de ser decisão de duas etapas do modelo.
    (tem("crm_find_and_book_appointment")
      ? "Se o lead já disse DIA e HORA, use `crm_find_and_book_appointment`: ela " +
        "confere a disponibilidade e grava o compromisso na MESMA chamada. Ela é o caminho preferido nesse caso " +
        "— não consulte e pare por aí, deixando o lead sem horário marcado. Se o horário " +
        "pedido não estiver livre, ela devolve os horários do dia; ofereça um deles ao lead.\n"
      : "") +
    "Checar e marcar horário com as ferramentas de agenda está SEMPRE dentro da sua " +
    "autonomia quando essas ferramentas estão disponíveis para você — mesmo que as instruções da empresa " +
    'peçam para encaminhar decisões fora da sua autonomia a um gerente/responsável nomeado (ex.: "fale com o ' +
    'Fulano"). Isso vale para OUTRAS decisões (desconto, exceção de política, algo que a ferramenta não ' +
    "cobre) — nunca para simplesmente consultar ou marcar um horário que a ferramenta resolve sozinha. NÃO " +
    'diga "vou confirmar/verificar com [nome de pessoa/equipe]" para justificar não ter chamado a ferramenta: ' +
    "chame primeiro, e só fale de encaminhar a alguém se a ferramenta genuinamente não resolver."
  );
}

/**
 * O mesmo ensino para quem CONSULTA a agenda e não marca.
 *
 * ⚠️ Este bloco existe porque o de cima nomeia `crm_book_appointment` em toda
 * frase, e há um arranjo legítimo e comum em que essa ferramenta não é dada ao
 * agente de propósito: o negócio quer que uma PESSOA confirme cada horário, e a
 * IA só consulta e registra o pedido. Clínica, salão, consultório.
 *
 * Antes desta divisão, esse agente não recebia bloco nenhum — a condição era
 * `toolIds.includes('crm_book_appointment')` — e ficava sem justamente a parte
 * que lhe cabe: não prometer "vou verificar e te aviso" sem ter consultado. Dar
 * a ele o bloco inteiro seria pior: ensinaria uma ferramenta que ele não tem, e
 * o modelo tentaria chamá-la.
 *
 * O que muda de conteúdo é só o desfecho: lá a checagem termina em marcar, aqui
 * termina em oferecer o horário e dizer, sem rodeio, que quem confirma é uma
 * pessoa. Isso não é hesitação — é o desenho do negócio, e o texto diz isso para
 * o modelo não confundir com incerteza dele.
 */
const AGENDA_CONSULTA_SYSTEM_BLOCK =
  "## Agenda — consulte antes de falar de horário\n" +
  "Se o lead mencionou (agora ou em qualquer mensagem anterior da conversa) um dia/horário " +
  "específico que ainda não foi checado, chame crm_find_free_slots NESTE turno antes de responder. " +
  'Não repita "vou verificar e te aviso" sem ter chamado a ferramenta — um "vou verificar" só é ' +
  "aceitável na MESMA resposta em que você já chamou e ela falhou ou não trouxe resultado.\n" +
  "Você NÃO tem ferramenta para marcar: quem confirma o horário é uma pessoa da equipe. Então " +
  'NUNCA diga "confirmado", "está marcado", "reservei" ou equivalente — nem depois de o lead ' +
  "aceitar um horário que você ofereceu. Diga que vai passar para a equipe confirmar. Isso é como " +
  "o negócio funciona, não uma limitação a esconder nem uma incerteza sua.\n" +
  "Consultar a agenda com crm_find_free_slots está SEMPRE dentro da sua autonomia — mesmo que as " +
  "instruções da empresa peçam para encaminhar decisões a um responsável nomeado. Aquilo vale para " +
  "OUTRAS decisões (desconto, exceção de política); nunca para simplesmente olhar quais horários " +
  'existem. Não use "vou confirmar com [nome]" como desculpa para não ter consultado: consulte ' +
  "primeiro, e aí diga a quem passa.";

/**
 * O PRIMEIRO PASSO da cadeia de agenda, residente (#1019).
 *
 * ─── O que faltava, medido ──────────────────────────────────────────────────
 *
 * Os dois blocos acima nomeiam `crm_find_free_slots` em toda frase e
 * `crm_list_event_types` em NENHUMA. A cadeia de dois passos — listar os tipos,
 * pegar o `slug`, consultar os horários COM esse slug — existia só na
 * `description` da própria ferramenta, que é onde o modelo a lê por último e
 * sem o peso de uma instrução. Um agente com as três capacidades ligadas
 * chamava a lista e parava ali; o relato da issue mede 4 chamadas de lista com
 * o slug disponível e zero de `crm_find_free_slots` na sequência.
 *
 * ─── Por que este bloco é CONDICIONAL, e não texto fixo ─────────────────────
 *
 * Nomear `crm_list_event_types` para quem não a tem seria exatamente o erro que
 * a divisão dos outros dois blocos já evita (`AGENDA_CONSULTA_SYSTEM_BLOCK`:
 * "dar a ele o bloco inteiro seria pior — ensinaria uma ferramenta que ele não
 * tem, e o modelo tentaria chamá-la"). Por isso o bloco entra só quando o
 * agente tem as DUAS pontas: a lista e quem consome o slug.
 *
 * Ensino, não garantia: a garantia determinística é o `agendaStallGate`
 * (`before-send.ts`), que agora reconhece a promessa feita com o nome do
 * serviço. Os dois juntos é que fecham o caso — um ensina o caminho, o outro
 * impede que a resposta saia por fora dele.
 */
const AGENDA_CADEIA_SYSTEM_BLOCK =
  "## Agenda — os dois passos, no mesmo turno\n" +
  "Para falar de um horário REAL você precisa de duas coisas: o TIPO de atendimento (o `slug`) e os " +
  "horários daquele tipo. Você tem `crm_list_event_types` para a primeira e `crm_find_free_slots` para " +
  "a segunda — e o segundo passo PRECISA do `slug` que o primeiro devolve.\n" +
  "Se o lead pediu horário e você ainda não tem o `slug` do tipo (ou não sabe a qual tipo ele se " +
  "refere), chame `crm_list_event_types` NESTE turno, escolha o tipo pelo que o lead descreveu e chame " +
  "`crm_find_free_slots` com esse `slug` NO MESMO TURNO, antes de responder. Parar depois da lista e " +
  'responder "vou verificar/organizar" é o defeito: a lista é o começo da conversa com a agenda, não a ' +
  "resposta. Se o tipo que o lead pediu não estiver na lista, diga isso a ele nomeando o que existe — " +
  "não prometa verificar o que você já sabe que não tem.\n" +
  "Nunca invente um `slug`: ele vem da lista, escrito igualzinho.";

/**
 * Os blocos de agenda que ESTE agente recebe — a decisão num lugar só, testável.
 *
 * A régua é o que o agente TEM: os dois blocos de ensino nomeiam ferramentas, e
 * nomear uma ferramenta ausente faz o modelo tentar chamá-la.
 */
export function blocosDeAgendaResidentes(toolIds: readonly string[]): string[] {
  const blocos: string[] = [];
  // A regua de "quem marca" e a da main (#831): `temFerramentaDeMarcacao` conta
  // tambem `crm_find_and_book_appointment`, e o texto do bloco nomeia so as
  // ferramentas que ESTE agente tem — usar o texto fixo aqui desfaria a #831 no
  // caminho do turno.
  if (temFerramentaDeMarcacao(toolIds)) {
    blocos.push(agendaSystemBlock(toolIds));
  } else if (toolIds.includes("crm_find_free_slots")) {
    // Só consulta: o bloco de cima nomeia uma ferramenta que ele não tem.
    blocos.push(AGENDA_CONSULTA_SYSTEM_BLOCK);
  }
  if (toolIds.includes("crm_list_event_types") && toolIds.includes("crm_find_free_slots")) {
    blocos.push(AGENDA_CADEIA_SYSTEM_BLOCK);
  }
  return blocos;
}

/**
 * Tools de agenda cuja EXECUÇÃO neste turno arma o `agendaStallGate` (before-send.ts) —
 * ver o wrap no loop de montagem das tools MCP, mais abaixo.
 */
export const AGENDA_TOOL_NAMES = new Set([
  "crm_find_free_slots",
  "crm_book_appointment",
  "crm_reschedule_appointment",
  // Issue #831: a ferramenta que consulta E marca numa chamada só. Ela EXECUTA
  // marcação, então precisa armar o mesmo gate: sem isto, o turno em que a IA
  // marcou passaria sem o `agendaStallGate` — o gate que existe justamente para
  // detectar "falou de agenda e nada foi gravado".
  "crm_find_and_book_appointment",
]);

/**
 * O agente consegue GRAVAR um horário sozinho (marcar ou remarcar)?
 *
 * Duas ferramentas MARCAM um horário novo: `crm_book_appointment` e, desde a issue
 * #831, a que consulta e marca numa chamada só (`crm_find_and_book_appointment`).
 * Ela decide QUAL bloco residente o agente recebe (`blocoResidenteDaAgenda`): o de
 * quem marca ou o de quem só consulta — divergindo, o bloco diria "você NÃO tem
 * ferramenta para marcar" a um agente que tem.
 *
 * O veto do gate NÃO lê esta função, e já leu: ele recebia um booleano
 * `podeMarcar` e escrevia uma lista fixa de ferramentas para todo agente que
 * marca — inclusive as que o agente não tem. Hoje ele recebe a lista exata
 * (`ferramentasDeAgendaDoAgente`).
 *
 * ⚠️ `crm_reschedule_appointment` está FORA, de propósito. Ela grava na agenda,
 * mas só MOVE um compromisso que já existe — não cria um. Incluí-la alargava o
 * portão além do que a #831 pede: o agente que tem só a remarcação (e que antes
 * caía no bloco de só-consulta) passava a receber o `agendaSystemBlock`, que
 * nomeia ferramentas de marcar que ele não tem — exatamente o modo de falha que
 * o bloco irmão existe para evitar, e que um dono aparando capacidades para caber
 * no teto de 25 tende a produzir.
 */
export function temFerramentaDeMarcacao(toolIds: readonly string[]): boolean {
  return (
    toolIds.includes("crm_book_appointment") || toolIds.includes("crm_find_and_book_appointment")
  );
}

/**
 * O agente tem alguma ferramenta de agenda? É o que ARMA o `agendaStallGate`.
 *
 * Exportada porque o caminho de prévia (`preview.ts`) monta o mesmo contexto de
 * gate por conta própria, e as duas condições precisam ser a MESMA: se a prévia
 * armar diferente do turno real, quem afina o prompt testa contra um gate que não
 * é o que vai rodar — e o defeito aparece só com cliente na frente.
 */
export function temFerramentaDeAgenda(toolIds: readonly string[]): boolean {
  return toolIds.some((t) => AGENDA_TOOL_NAMES.has(t));
}

/**
 * As ferramentas de agenda que ESTE agente tem — a lista que o veto do
 * `agendaStallGate` nomeia.
 *
 * ⚠️ É a lista, e não um booleano, porque o texto do veto é ENSINO: ele diz ao
 * modelo o que chamar. Com `podeMarcar: boolean` o gate só sabia que o agente
 * marca, e nomeava a família inteira — `crm_book_appointment` para quem tem só a
 * conjunta, `crm_reschedule_appointment` para quem não remarca. Nomear ferramenta
 * ausente faz o modelo tentar chamá-la, e a correção vira um segundo defeito.
 */
export function ferramentasDeAgendaDoAgente(toolIds: readonly string[]): string[] {
  return [...AGENDA_TOOL_NAMES].filter((t) => toolIds.includes(t));
}

/**
 * QUAL bloco residente de Agenda este agente recebe — ou nenhum.
 *
 * A escolha vivia inline dentro de `executarTurnoDoAgente`, inalcançável sem o
 * runtime inteiro: nenhum teste chegava nela, e o portão que a #831 alargou
 * (`temFerramentaDeMarcacao`) só era exercitado pela própria função, nunca pelo
 * ponto de uso. Aqui ela é chamável — e o que se prende é o par
 * "quem recebe o bloco de marcar" × "quem recebe o de só consultar", que é
 * exatamente onde o texto ensina, ou não, uma ferramenta que o agente não tem.
 */
export function blocoResidenteDaAgenda(toolIds: readonly string[]): string | null {
  // Uma lei só: quem decide os blocos residentes da Agenda e
  // `blocosDeAgendaResidentes` — esta fatia (#1019) acrescentou a CADEIA de dois
  // passos como segundo bloco. Aqui fica o PRIMEIRO deles (o de marcar ou o de so
  // consultar), que e o par que o teste da #831 prende.
  return blocosDeAgendaResidentes(toolIds)[0] ?? null;
}
