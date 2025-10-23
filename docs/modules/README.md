# Inventário e stubs de módulos

A rotina `pnpm modules:inventory` varre o código (seletores, gatilhos, testes e front) em busca de nomes de módulos como `eco_*` ou `USOMEMÓRIAS`. Os nomes são normalizados em _casefold_ com remoção de acentos para que `usomemorias.txt`, `usomemorias` ou `Usomemórias` caiam na mesma chave.

Quando um módulo referenciado não existe no filesystem, o script cria um _stub_ idempotente em `server/assets/<categoria>/<nome>.txt` (e replica em `server/dist/assets`). O stub contém apenas o front‑matter padrão e corpo vazio, garantindo contagem de tokens igual a zero. Assim, intents ou heurísticas que requisitam o módulo não quebram a montagem do contexto, mas também não injetam texto adicional.

Categorias são resolvidas por heurísticas simples (prefixos como `eco_heuristica` → `modulos_cognitivos`) e por um mapa manual para os casos especiais listados no script. Ajuste o mapa ao adicionar novas famílias de módulos.

Sempre que novos módulos forem introduzidos ou quando surgirem referências novas, execute novamente o inventário para atualizar os stubs e o relatório `docs/modules-inventory.md`.
