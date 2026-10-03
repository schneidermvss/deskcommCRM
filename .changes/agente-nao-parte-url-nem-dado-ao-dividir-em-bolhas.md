---
impacto: nada_mudou
secao: corrigido
titulo: Com "dividir em mensagens" ligado, o agente não corta mais links (ex.: rota do Waze) nem endereços no meio
---
Ao dividir uma resposta longa em mensagens, o corte tratava qualquer ponto, "?" ou "!" como fim de frase, inclusive os de dentro de um link. Um link como "https://waze.com/ul?q=BR-116…" saía em pedaços ("https://waze." / "com/ul?" / "q=…"), às vezes com espaço no meio, e o cliente recebia um link quebrado. Agora a pontuação só encerra uma frase quando é seguida de espaço ou do fim do texto, então links, domínios, versões ("1.0") e valores ("R$ 49.990,00") ficam sempre inteiros. A divisão continua sendo por parágrafo (linha em branco) e, só quando um parágrafo passa do limite de caracteres da conexão, por fim de frase. Não é preciso fazer nada na instalação.
