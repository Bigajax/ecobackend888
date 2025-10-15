# Analytics store

Armazena métricas em memória para acompanhamento rápido (p95-friendly).

- `qualityAnalyticsStore.recordQualitySample(sample)` adiciona evento de qualidade e devolve médias de 24h/7d.
- `setPersistence(handler)` permite configurar uma escrita assíncrona opcional (ex.: Supabase). Falhas são ignoradas.
- `getQualitySnapshot()` retorna o último snapshot sem registrar novo evento.
- `reset()` é usado apenas em testes.

O store não bloqueia o fluxo principal; qualquer persistência ocorre em background.
