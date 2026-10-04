# Fragmentação das respostas do agente

## Fluxo identificado

1. `lib/agent-engine/edge/llm/run-model-call.ts`: `generateText` do SDK recebe o conjunto de ferramentas; o envio é uma chamada de ferramenta, não tokens de streaming.
2. `lib/agent-engine/agent/inbound-turn.ts`: o schema Zod de `send_message` recebe `body`. O executor verifica corpo vazio e regras do turno; `runBeforeSend` aplica os guardrails, incluindo spinning/disclosure. O texto livre de `result.text` não é enviado automaticamente.
3. `lib/agent-engine/agent/split-message.ts`: `splitForSend` calcula as bolhas tanto para a pausa humana quanto para `sendInBubbles`. A divisão efetiva acontece aqui, antes do canal. O callback avança `seq` por envio físico.
4. `lib/agent-engine/edge/channel/waha-adapter.ts`: `WahaChannelAdapter.send` chama `sendTurnMessage`, em `edge/crm/send-message.ts`. O ledger usa `(job_id, seq)` para idempotência e chama `sendMessageHandler`.
5. `app/api/v1/messages/_handler.ts`: grava uma linha de `messages` com status `queued` antes de chamar o adapter. Ausência de conexão mantém a espera; falhas e recibos atualizam o status. O resultado `queued` permite reagendamento do job, com a mesma identidade do envio. Não divide o corpo em frases.
6. `lib/channels/adapters/waha.ts`: passa `envelope.body` inteiro a `WahaClient.sendMessage`; `lib/waha/client.ts` faz um POST `/api/sendText` com `text` no JSON. O adapter Meta também recebe o corpo do envelope. Não foi encontrado outro splitter textual neste caminho.

## Causa e limite da evidência

Antes desta correção, `splitIntoBubbles` separava todo parágrafo por `\n\n`, mesmo quando a resposta inteira cabia. Parágrafos grandes passavam por `splitSentences` e, depois, por `splitWords`; esse último recurso dividia por espaços e podia separar frases, preços, telefones e endereços, além de perder quebras de linha.

A versão analisada já exigia espaço ou fim de texto após `.?!` para terminar uma sentença. O `?` de `ul?q=` não reproduz a quebra do exemplo nessa versão. Os comentários do próprio módulo registram uma implementação anterior que separava esses sinais indiscriminadamente. Sem o commit/configuração da instalação que enviou o exemplo, não é possível confirmar que ela roda essa implementação anterior ou que o modelo produziu duas chamadas. Nenhuma VPS foi acessada.

## Correção localizada

Respostas que cabem ficam inteiras. Para respostas longas, priorizam-se parágrafos e, quando necessário, frases completas. HTTP/HTTPS são protegidos por intervalos atômicos, abrangendo query e fragmento. Abreviações comuns de endereços e nomes não encerram sentença. Não há fallback por palavras. O texto dentro de cada bolha mantém seus espaços, linhas, emojis e pontuação; somente bordas são aparadas.

`split_max_chars` é um tamanho alvo de bolha, não uma licença para truncar dados: uma frase/URL sem fronteira segura pode ultrapassá-lo, como já ocorria com palavras gigantes. O teto de mensagens por turno continua podendo juntar o excedente na última bolha. Limites reais do provedor continuam sujeitos à validação do transporte. Nenhum delimitador artificial foi inserido no texto do modelo.

Preservados: feature flag, cálculo da primeira bolha, ordem sequencial, jitter anti-ban, interrupção ao primeiro veto/falha, teto de envios e ledger de idempotência. A instrução do modelo e a descrição da configuração foram alinhadas ao comportamento novo.

## Provas

`tests/unit/agent-split-semantic.test.ts` exercita os seis casos solicitados pelo usuário, inclusive o callback efetivo de envio, duas URLs com query e fragmento, resposta longa, endereço abreviado e ausência de fronteira segura. Os testes existentes de divisão/envio foram atualizados somente onde o contrato de parágrafos mudou; regressões de pausa, falha e teto continuam verificadas.
