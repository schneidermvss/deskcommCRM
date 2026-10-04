import { describe, expect, it, vi } from "vitest";

import { sendInBubbles, splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";

const waze = "https://waze.com/ul?q=BR-116%2C%206225%2C%20Novo%20Hamburgo%2C%20RS&navigate=yes";

describe("resposta do agente preserva texto e dados antes do canal", () => {
  it.each([
    "Claro 😊 O endereço é BR-116, 6225, Novo Hamburgo/RS.",
    `Você pode abrir direto no Waze por aqui: ${waze}`,
    "Trabalhamos com financiamento. Também avaliamos seu veículo na troca.",
    "Olá 😊\n\nTrabalhamos com financiamento.\n\nTambém avaliamos seu veículo na troca.",
    "Confira: https://nilsonveiculos.com.br/veiculo?id=123&utm_source=whatsapp",
    "Confira: https://exemplo.com/a_b-c/d?x=%20&y=1#fim-2",
  ])("curta/média chega em um envio: %s", async (body) => {
    const send = vi.fn(async (_body: string) => ({ kind: "sent" }));
    const sleep = vi.fn(async () => undefined);
    await sendInBubbles(body, { enabled: true, maxChars: 600, send, sleep, jitter: () => 1 });
    expect(send.mock.calls).toEqual([[body]]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("acima do limite prefere parágrafos e mantém os dados inteiros", () => {
    const paragraphs = [
      "Claro 😊 O endereço é BR-116, 6225, Novo Hamburgo/RS.",
      "O Chevrolet Onix 1.0 LT 2020, placa ABC1D23, custa R$ 49.990,00.",
      "Nosso telefone é (51) 99999-1234.",
      `Rota: ${waze}`,
    ];
    const body = paragraphs.join("\n\n");
    const bubbles = splitIntoBubbles(body, 90);
    expect(bubbles).toEqual(paragraphs);
    expect(bubbles.every((bubble) => bubble.length <= 90)).toBe(true);
    expect(bubbles.join("\n\n")).toBe(body);
  });

  it("usa frases completas quando um parágrafo excede o limite", () => {
    const sentences = ["Trabalhamos com financiamento.", "Também avaliamos seu veículo na troca."];
    expect(splitIntoBubbles(sentences.join(" "), 40)).toEqual(sentences);
  });

  it("uma frase sem fronteira segura fica inteira, mesmo acima do alvo", () => {
    const body = "O endereço é Av. Brasil, 6225, Novo Hamburgo/RS e o telefone é (51) 99999-1234.";
    expect(splitIntoBubbles(body, 30)).toEqual([body]);
  });

  it("URL maior que o alvo não perde query, fragmento nem pontuação", () => {
    const url = "https://exemplo.com/a_b-c/d?x=%20&y=1#fim-2";
    const body = `Veja as opções. ${url} Podemos conversar amanhã?`;
    const bubbles = splitIntoBubbles(body, 20);
    expect(bubbles.filter((bubble) => bubble.includes(url))).toHaveLength(1);
    expect(bubbles.join(" ")).toBe(body);
  });

  it("não normaliza linhas, espaços, emojis ou pontuação dentro da mensagem", () => {
    const body = `Opções 😊:\n  Chevrolet Onix\n\nPreço: R$ 49.990,00!\n${waze}`;
    expect(splitIntoBubbles(body, 600)).toEqual([body]);
  });
});
