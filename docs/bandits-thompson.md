# Thompson Sampling na ECO

Os bandits de Thompson sampling controlam qual variante de módulo (full/mini/rules) será usada por pilar (`Linguagem`, `Encerramento`, `Modulacao`). Cada braço mantém uma distribuição Beta atualizada com o histórico de recompensas.

## Recompensa

A recompensa aplicada após cada resposta é:

```
reward = Q - λ * (tokens_total / 1000)
```

- `Q` é a média dos flags de qualidade (`estruturado_ok`, `memoria_ok`, `bloco_ok`).
- `λ` (`BANDIT_LAMBDA`) padrão `0.01`, balanceando ganho de qualidade vs. custo de tokens.
- `tokens_total` é o total consumido na resposta.

O valor é truncado para `[-1, 1]` antes de atualizar `alpha` ou `beta`.

## Pseudo-código

```pseudo
state = initBandits()
for each pillar in [Linguagem, Encerramento, Modulacao]:
  arm = pickArm(pillar, state)  // sample Beta(alpha, beta)
  executar módulo correspondente ao braço

// após finalizar resposta
reward = Q - lambda * (tokens_total / 1000)
for each (pillar, arm) usado:
  if reward > 0:
    alpha[pillar][arm] += reward_clipped
  else:
    beta[pillar][arm] += |reward_clipped|
  pulls[pillar][arm] += 1
persistir estado em `.cache/bandits.json`
```

## Inicialização

`initBandits(seed?)` cria um estado com `alpha = beta = 1` para todos os braços e, opcionalmente, configura um gerador pseudo-aleatório determinístico para reproduzir sequências em testes.

O estado é carregado em memória e persistido em disco por `src/bandits/storage.ts`. Reinícios do serviço reutilizam o arquivo `.cache/bandits.json` quando disponível.
