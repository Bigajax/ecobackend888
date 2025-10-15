# Quality validators

Utilitários de validação usados no pós-processamento das respostas da Eco.

## Disponível

- `checkEstrutura(text)` – confirma se o texto segue a estrutura mínima com cabeçalhos de espelho/insight/convite ou pergunta.
- `checkMemoria(text, memIds)` – verifica se referências a memórias recuperadas aparecem na resposta (`mem_id:` ou tags).
- `checkBlocoTecnico(raw, intensidade?)` – garante que o bloco técnico JSON existe quando necessário e possui campos básicos consistentes.
- `computeQ(flags)` – média simples dos três sinais (`estruturado_ok`, `memoria_ok`, `bloco_ok`).

As funções são puras e não dependem de serviços externos; podem ser usadas em testes ou monitoramento.
