---
impacto: exige_acao
secao: corrigido
titulo: Sincronização dos resultados da prospecção
---

A sincronização OpenSquad agora tem suas tabelas no banco versionado. Reenviar uma execução ou arquivo atualiza o registro existente; somente o administrador da própria empresa pode consultar os resultados na tela. A tela também usa o idioma escolhido para datas e o utilitário comum para copiar texto.

## Requer atenção

Aplique a migration 0509 pelo fluxo de atualização do kit antes de usar a sincronização. Instalações novas recebem o mesmo schema pelo baseline. Se essas tabelas foram criadas manualmente e contêm chaves duplicadas, a criação dos índices será recusada: revise os registros antes de atualizar, sem apagar dados automaticamente.
