---
impacto: exige_acao
secao: corrigido
titulo: Instalação e imagens acompanham a distribuição de schneidermvss
---
Os comandos de instalação, as imagens padrão e a identificação dos containers
passam a apontar para schneidermvss/deskcommCRM. Antes de instalar ou atualizar,
publique nesse namespace as quatro imagens da versão escolhida e sua release.
Uma instalação existente precisa conferir seu remoto origin antes de atualizar:
ele deve apontar para https://github.com/schneidermvss/deskcommCRM.git se a intenção
é acompanhar esta distribuição. O comando db:migrate deixa de simular sucesso:
ele retorna erro e orienta a atualização pelo kit, que já faz backup e verifica
a saúde da instalação. Não aplica schema por conta própria.
