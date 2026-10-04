# Distribuição de schneidermvss — 03/10/2026

Base examinada: `ce7be71e293ccb3688b859f8ba38aedd1c61524e`.
Este é um registro pontual, não uma declaração de prontidão para produção.

## Correções operacionais

- URLs de instalação e labels dos quatro Dockerfiles acompanham este repositório.
- Namespace padrão no kit, Compose e exemplo de ambiente:
  `ghcr.io/schneidermvss`, correspondente ao dono usado no workflow de publicação.
- `db:migrate` retorna erro e aponta para o kit de atualização. Não modifica o
  banco; o kit continua responsável por backup, baseline e saúde.
- `.env.example` explica a telemetria padrão e como desligar ou usar conta própria.

Antes de instalar, publique as quatro imagens e a release. Em instalações
existentes, confira o remoto `origin`. Não foi validada uma publicação ou VPS real.

## Living System Checklist — distribuição e comando de banco

1. Entrada: clone deste repositório e comandos documentados no README.
2. Saída: imagens dos quatro serviços; db:migrate orienta para update.sh.
3. Registro: stderr e código de saída do comando; logs existentes do kit.
4. Superfície: terminal do operador e README; nenhuma tela de CRM nova.
5. Porta: comandos de instalação e atualização no README.
6. Anti-morte: comando sem efeito recusa sucesso; kit conserva recuperação existente.
7. Configuração: imagens no Compose/.env e remoto Git da instalação.
8. Continuidade: não altera atendimento, handoff ou turnos de IA.
9. Retorno: erro visível orienta uso do fluxo com backup; nenhuma decisão automática nova.
10. Mapa: relações README → kit → Compose → imagens documentadas aqui;
    nenhuma nova peça do motor ou superfície de API.

## Continuação em 04/10/2026

A seleção das ferramentas e os blocos residentes de agenda foram extraídos para
`lib/agent-engine/agent/agenda-residente.ts`. O turno importa o mesmo conjunto e
reexporta as funções públicas, mantendo compatibilidade. Os textos foram movidos
sem mudanças; os testes existentes de agenda exercitam o caminho público.
O mapa é `docs/architecture/agenda-residente.architecture.json`.

O operador publica `agentConfig.toolIds`, que alimenta a seleção de blocos; ela
alimenta o prompt e os sinais do `agendaStallGate`. Os registros, a configuração
na tela e o retorno de falha seguem os caminhos existentes do turno e do gate.
A refatoração não cria decisão automática nem altera a continuidade do atendimento.

Por instrução do usuário, a publicação desta rodada é apenas no GitHub: imagens
Docker e validação/atualização de VPS ficam fora do escopo autorizado.

## Limites

`docs/current-state.md` descreve um commit antigo: use sua data e não derive dele
o estado de hoje. A divisão de `inbound-turn.ts` foi iniciada pelo módulo de agenda;
a orquestração principal continua extensa. Novos recortes exigem regressão do
fluxo do agente; tamanho sozinho não prova defeito.
