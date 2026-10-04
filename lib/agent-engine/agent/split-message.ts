/**
 * Divide somente quando o texto excede o tamanho configurado. Parágrafos e
 * frases completas são fronteiras possíveis; espaços entre palavras não são.
 * Uma unidade sem fronteira segura pode ultrapassar o alvo: nunca truncamos
 * URL, endereço, telefone, preço ou frase para cumprir um limite de bolha.
 */
export function splitIntoBubbles(text: string, maxChars: number): string[] {
  const body = (text ?? "").trim();
  if (!body) return [];
  if (!Number.isFinite(maxChars) || maxChars <= 0 || body.length <= maxChars) return [body];

  const paragraphs = segmentsAt(body, /\n[ \t]*\n+/g);
  const units = paragraphs.flatMap((paragraph) =>
    paragraph.trim().length <= maxChars ? [paragraph] : splitSentences(paragraph),
  );
  const bubbles: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && (current + unit).trim().length > maxChars) {
      bubbles.push(current.trim());
      current = "";
    }
    current += unit;
  }
  if (current.trim()) bubbles.push(current.trim());
  return bubbles;
}

/** Fatias contíguas: mantém o texto e seus espaços/quebras dentro de cada bolha. */
function segmentsAt(text: string, boundary: RegExp): string[] {
  const units: string[] = [];
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    units.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) units.push(text.slice(start));
  return units;
}

/** URLs são intervalos atômicos, incluindo toda a query e o fragmento. */
function splitSentences(text: string): string[] {
  const urls = Array.from(text.matchAll(/https?:\/\/[^\s]+/giu), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const units: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    const end = match.index + match[0].length;
    if (urls.some((url) => match.index >= url.start && match.index < url.end)) continue;
    // Endereços e nomes abreviados não terminam em "Av." / "Dr." / "J.".
    const prefix = text.slice(0, end);
    if (
      /\b(?:av|r|rod|estr|trav|sr|sra|dr|dra|prof|profa|eng|km)\.$/i.test(prefix) ||
      /\b[A-Z]\.$/.test(prefix)
    )
      continue;
    units.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) units.push(text.slice(start));
  return units.length ? units : [text];
}

/**
 * Outcome mínimo que o send do canal devolve (subconjunto usado aqui).
 * messageId casa com o shape real de ChannelSendResult (string | null | undefined
 * conforme o kind) — não apenas string opcional.
 */
export interface BubbleOutcome {
  kind: string;
  messageId?: string | null;
}

export interface SendInBubblesOpts<T extends BubbleOutcome = BubbleOutcome> {
  enabled: boolean;
  maxChars: number;
  send: (body: string) => Promise<T>;
  sleep: (ms: number) => Promise<void>;
  /** ms de jitter humano entre bolhas (só entre, não antes da 1ª). */
  jitter: () => number;
  /**
   * Roda UMA vez, antes do 1º envio, recebendo a 1ª bolha — é o gancho do
   * atraso humano do turno ("digitando…" + espera proporcional; ver
   * `atraso-humano.ts`).
   *
   * Recebe a 1ª BOLHA, não o corpo inteiro, e a diferença é a que se vê no
   * aparelho: quem escreve em bolhas manda a primeira assim que ela fica
   * pronta, não depois de digitar as cinco. Dimensionar a espera pelo corpo
   * todo faria uma resposta longa e picotada ficar parada no teto antes da
   * primeira palavra aparecer.
   *
   * UMA vez, e não por bolha, porque entre bolhas já existe o jitter anti-ban:
   * chamá-lo a cada uma somaria duas esperas na mesma pausa.
   *
   * OPCIONAL — sem ele o comportamento é exatamente o de antes, que é o que
   * mantém os testes existentes intactos. Chamador de produção há UM só
   * (`inbound-turn.ts`); o turno de follow-up NÃO passa por aqui — ele fala com
   * `channel.send` direto (`followup-turn.ts:604`), então a mensagem proativa
   * segue saindo sem pausa humana. É escopo deliberado: o "rápido demais" que
   * este gancho conserta é o da RESPOSTA que chega junto com o "✓✓" do cliente,
   * e um follow-up não responde a nada que ele acabou de mandar.
   */
  antesDaPrimeira?: (primeiraBolha: string) => Promise<void>;
  /**
   * Quantas bolhas ainda cabem no teto de mensagens do turno (MAX_SENDS_PER_TURN).
   * Uma resposta longa pode ter várias bolhas; sem isto um único send_message
   * sairia em 7 mensagens físicas, passando do teto que existe para barrar isso.
   * Ausente = sem teto (o comportamento de antes).
   */
  maxBubbles?: number;
}

/**
 * Envia o corpo em bolhas quando `enabled`; senão um envio só. Cada bolha passa
 * pelo mesmo `send` (que no runtime é o channel.send pós-guardrails, com seq++).
 * Para no 1º outcome que não seja de sucesso ('sent'/'already_sent'/'queued')
 * e o devolve — não segue mandando bolha após veto/bloqueio/falha.
 *
 * LIMITAÇÃO CONHECIDA: o contador de cap diário do pacing anti-ban (recordSend)
 * conta o send lógico UMA vez por turno, então um turno de N bolhas avança o cap
 * em 1, não N — aceitável por ora (doutrina: "anti-ban gateia uma vez"); revisitar
 * se o warm-up precisar de precisão por mensagem física.
 */
export const OK_KINDS = new Set(["sent", "already_sent", "queued"]);

/** Pede um único envio ao modelo; formatação de parágrafos não é delimitador. */
export function instrucaoDeBolhas(ligado: boolean): string {
  return ligado
    ? "Escreva cada resposta numa ÚNICA chamada de send_message. Preserve URLs, endereços, telefones, preços e nomes completos. Use quebras de linha apenas para organizar a leitura: elas não criam mensagens separadas. O sistema divide somente respostas que excedem o tamanho configurado, em parágrafos ou frases completas. Nunca chame send_message mais de uma vez no mesmo turno: mensagens enviadas juntas podem chegar fora de ordem."
    : "";
}

/**
 * A decisão de fatiamento do `sendInBubbles`, exposta separadamente (issue #654).
 *
 * O turno precisa saber QUAL é a primeira bolha ANTES de o guardrail tomar o
 * lock do número: desde o conserto da #654 a pausa humana é paga fora da
 * transação (no `esperaForaDoLock` do turno; o dimensionamento é o de
 * `atraso-humano.ts`), e ela é medida pela primeira bolha — não pelo corpo todo.
 * Duas cópias desta lógica fariam a
 * pausa medir um texto e o canal mandar outro.
 *
 * Pura: sem I/O, sem relógio, sem canal. Devolve `[]` para corpo vazio (quem
 * chama decide — o `sendInBubbles` passa o corpo original ao `send`).
 */
export function splitForSend(
  body: string,
  enabled: boolean,
  maxChars: number,
  maxBubbles: number = Number.POSITIVE_INFINITY,
): string[] {
  if (!enabled) return [body];
  const bubbles = splitIntoBubbles(body, maxChars);
  if (bubbles.length <= maxBubbles || maxBubbles < 1) return bubbles;
  // Teto de mensagens FÍSICAS do turno (MAX_SENDS_PER_TURN, "bolhas incluídas"): o que
  // passa dele segue junto na última bolha, na ordem — nada do texto se perde.
  // ponytail: a última bolha pode passar de maxChars; é o preço de não picotar além do teto.
  return [...bubbles.slice(0, maxBubbles - 1), bubbles.slice(maxBubbles - 1).join("\n\n")];
}

export async function sendInBubbles<T extends BubbleOutcome>(
  body: string,
  opts: SendInBubblesOpts<T>,
): Promise<T> {
  const bubbles = splitForSend(body, opts.enabled, opts.maxChars, opts.maxBubbles);
  if (bubbles.length === 0) return opts.send(body); // corpo vazio: deixa o canal decidir
  let last: T | undefined;
  for (let i = 0; i < bubbles.length; i++) {
    // Antes da 1ª: o atraso humano do turno. Entre as demais: o jitter anti-ban
    // que já existia. Nunca os dois na mesma pausa.
    if (i === 0) await opts.antesDaPrimeira?.(bubbles[0]!);
    else await opts.sleep(opts.jitter());
    last = await opts.send(bubbles[i]!);
    if (!OK_KINDS.has(last.kind)) return last; // veto/bloqueio/falha: para aqui
  }
  return last!;
}
