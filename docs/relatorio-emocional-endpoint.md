# Relatório emocional - contrato de API

As rotas montadas em `/api/relatorio-emocional`, `/api/v1/relatorio-emocional` e `/relatorio-emocional` continuam aceitando as mesmas formas de identificação do usuário, mas agora expõem um parâmetro opcional de visualização.

## Parâmetro `view`

- **Onde enviar**: query string (`?view=...`) ou header HTTP (`view`, `x-relatorio-view` ou `x-relatorio-emocional-view`).
- **Valores aceitos**: `mapa` (padrão) ou `linha_do_tempo`.
- **Comportamento**: quando ausente ou inválido, a API assume automaticamente `mapa`, garantindo compatibilidade com clientes antigos.

Essa informação também é registrada em Mixpanel através do evento `Relatório emocional acessado`, junto com o `distinctId` (quando fornecido) e a origem da chamada.
