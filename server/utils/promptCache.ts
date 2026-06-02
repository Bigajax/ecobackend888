/**
 * Sentinela de quebra de cache de prompt (Onda 2).
 *
 * Quando `ECO_PROMPT_CACHE=1`, o montador do prompt insere esta sentinela entre o PREFIXO ESTÁVEL
 * (identidade/voz/segurança — idêntico entre requests) e o SUFIXO DINÂMICO (memória/DEC/mensagem).
 * O `ClaudeAdapter` divide o system message nessa marca e aplica `cache_control: ephemeral` apenas no
 * prefixo, que é o que o cache por prefixo da Anthropic/OpenRouter consegue reaproveitar.
 *
 * Vive em utils (camada baixa) para ser importável tanto por `core/ClaudeAdapter` quanto por
 * `services/promptContext` sem inverter dependências.
 */
export const CACHE_PREFIX_SENTINEL = "<<<ECO_CACHE_BREAK>>>";
