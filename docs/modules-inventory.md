# Inventário de módulos

- Última varredura: 2025-10-15T20:29:57.860Z
- Total referenciados: 94
- Presentes: 28
- Stubs existentes: 66
- Stubs criados nesta execução: 0

| Módulo | Status | Caminho (server/assets) | Motivo |
| --- | --- | --- | --- |
| ANTISALDO_MIN.txt | presente | server/assets/modulos_core/ANTISALDO_MIN.txt | Matriz base de módulos; referenciado em server/services/promptContext/baseSelection.ts; referenciado em server/services/promptContext/stitcher.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ContextBuilder.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| BAD_REQUEST.txt | stub (existente) | server/assets/modulos_core/BAD_REQUEST.txt | referenciado em server/routes/promptRoutes.ts; referenciado em server/services/ConversationOrchestrator.ts |
| BASE_PROMPT.txt | stub (existente) | server/assets/modulos_core/BASE_PROMPT.txt | referenciado em server/tests/conversation/orchestratorFastPaths.test.ts |
| bloco_tecnico_memoria.txt | presente | server/assets/modulos_extras/bloco_tecnico_memoria.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ModuleSelection.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| BLOCO_TECNICO.txt | stub (existente) | server/assets/modulos_core/BLOCO_TECNICO.txt | Frontend legacy context builder |
| CONFIG_ERROR.txt | stub (existente) | server/assets/modulos_core/CONFIG_ERROR.txt | referenciado em server/services/ConversationOrchestrator.ts |
| developer_prompt.txt | presente | server/assets/modulos_core/developer_prompt.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/services/promptContext/Budgeter.ts; referenciado em server/services/promptContext/budget.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| DR_DISPENZA_BENCAO_CENTROS_LITE.txt | stub (existente) | server/assets/modulos_core/DR_DISPENZA_BENCAO_CENTROS_LITE.txt | Gatilhos de regulação |
| eco_bandit_arms.txt | stub (existente) | server/assets/modulos_core/eco_bandit_arms.txt | referenciado em server/routes/feedbackRoutes.ts; referenciado em server/services/conversation/responsePlanner.ts |
| ECO_CONTEMPLATIVE_PRACTICES.txt | stub (existente) | server/assets/modulos_core/ECO_CONTEMPLATIVE_PRACTICES.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_corpo_emocao.txt | presente | server/assets/modulos_filosoficos/eco_corpo_emocao.txt | ContextBuilder intents/gating; Gatilhos emocionais; Gatilhos estoicos; Matriz base de módulos |
| eco_corpo_sensacao.txt | stub (existente) | server/assets/modulos_filosoficos/eco_corpo_sensacao.txt | Matriz base de módulos |
| ECO_CREATIVE_WINDOWS.txt | stub (existente) | server/assets/modulos_core/ECO_CREATIVE_WINDOWS.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_CURIOSITY_FRAMEWORK.txt | stub (existente) | server/assets/modulos_core/ECO_CURIOSITY_FRAMEWORK.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_emo_vergonha_combate.txt | presente | server/assets/modulos_emocionais/eco_emo_vergonha_combate.txt | ContextBuilder intents/gating; Gatilhos emocionais; Matriz base de módulos |
| ECO_EMOTION_LEXICON_EXPANDED.txt | stub (existente) | server/assets/modulos_core/ECO_EMOTION_LEXICON_EXPANDED.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_estrutura_de_resposta.txt | presente | server/assets/modulos_core/eco_estrutura_de_resposta.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| ECO_ESTRUTURA_min.txt | stub (existente) | server/assets/modulos_core/ECO_ESTRUTURA_min.txt | Frontend legacy context builder |
| ECO_ETHICAL_FOUNDATION.txt | stub (existente) | server/assets/modulos_core/ECO_ETHICAL_FOUNDATION.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_feedback.txt | stub (existente) | server/assets/modulos_core/eco_feedback.txt | referenciado em server/routes/feedbackRoutes.ts |
| eco_fim_do_sofrimento.txt | presente | server/assets/modulos_filosoficos/eco_fim_do_sofrimento.txt | ContextBuilder intents/gating; Gatilhos estoicos; Matriz base de módulos |
| ECO_FORMAT_NV1.txt | stub (existente) | server/assets/modulos_core/ECO_FORMAT_NV1.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_FORMAT_NV2.txt | stub (existente) | server/assets/modulos_core/ECO_FORMAT_NV2.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_FORMAT_NV3.txt | stub (existente) | server/assets/modulos_core/ECO_FORMAT_NV3.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_heuristica_ancoragem.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_ancoragem.txt | ContextBuilder intents/gating; Gatilhos de heurísticas; Matriz base de módulos; referenciado em server/services/promptContext/heuristicaFlags.ts; referenciado em server/tests/promptContext/SelectorHeuristicas.test.ts |
| eco_heuristica_causas_superam_estatisticas.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_causas_superam_estatisticas.txt | Gatilhos de heurísticas; Matriz base de módulos; referenciado em server/services/promptContext/heuristicaFlags.ts |
| eco_heuristica_certeza_emocional.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_certeza_emocional.txt | Gatilhos de heurísticas; Matriz base de módulos; referenciado em server/services/promptContext/heuristicaFlags.ts; referenciado em server/tests/promptContext/SelectorHeuristicas.test.ts |
| eco_heuristica_disponibilidade.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_disponibilidade.txt | ContextBuilder intents/gating; Gatilhos de heurísticas; Matriz base de módulos |
| eco_heuristica_excesso_confianca.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_excesso_confianca.txt | ContextBuilder intents/gating; Gatilhos de heurísticas; Matriz base de módulos |
| eco_heuristica_ilusao_compreensao_passado.txt | stub (existente) | server/assets/modulos_cognitivos/eco_heuristica_ilusao_compreensao_passado.txt | Gatilhos de heurísticas |
| eco_heuristica_ilusao_validade.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_ilusao_validade.txt | ContextBuilder intents/gating; Gatilhos de heurísticas; Matriz base de módulos |
| eco_heuristica_intuicao_especialista.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_intuicao_especialista.txt | Gatilhos de heurísticas; Matriz base de módulos; referenciado em server/services/promptContext/heuristicaFlags.ts |
| eco_heuristica_regressao_media.txt | presente | server/assets/modulos_cognitivos/eco_heuristica_regressao_media.txt | ContextBuilder intents/gating; Gatilhos de heurísticas; Matriz base de módulos; referenciado em server/services/promptContext/heuristicaFlags.ts |
| ECO_HINTS.txt | stub (existente) | server/assets/modulos_core/ECO_HINTS.txt | referenciado em server/services/ConversationOrchestrator.ts; referenciado em server/tests/conversation/orchestratorFastPaths.test.ts |
| ECO_HYPOTHESIS_AS_OFFERING.txt | stub (existente) | server/assets/modulos_core/ECO_HYPOTHESIS_AS_OFFERING.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_identificacao_mente.txt | presente | server/assets/modulos_filosoficos/eco_identificacao_mente.txt | ContextBuilder intents/gating; Gatilhos emocionais; Gatilhos estoicos; Matriz base de módulos |
| ECO_INSTRUCOES_FINAIS.txt | stub (existente) | server/assets/modulos_core/ECO_INSTRUCOES_FINAIS.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_interactions.txt | stub (existente) | server/assets/modulos_core/eco_interactions.txt | referenciado em server/routes/feedbackRoutes.ts; referenciado em server/services/telemetry/interactionLogger.ts |
| ECO_KNAPSACK_BUDGET_TOKENS.txt | stub (existente) | server/assets/modulos_core/ECO_KNAPSACK_BUDGET_TOKENS.txt | ContextBuilder intents/gating |
| ECO_LANGUAGE_PRECISION.txt | stub (existente) | server/assets/modulos_core/ECO_LANGUAGE_PRECISION.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_memoria_revisitar_passado.txt | presente | server/assets/modulos_emocionais/eco_memoria_revisitar_passado.txt | ContextBuilder intents/gating; Matriz base de módulos |
| ECO_METAPHOR_POLICY.txt | stub (existente) | server/assets/modulos_core/ECO_METAPHOR_POLICY.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_MICRO_INQUIRIES.txt | stub (existente) | server/assets/modulos_core/ECO_MICRO_INQUIRIES.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_module_usages.txt | stub (existente) | server/assets/modulos_core/eco_module_usages.txt | referenciado em server/services/telemetry/interactionLogger.ts |
| ECO_NAVIGATION_MAPS.txt | stub (existente) | server/assets/modulos_core/ECO_NAVIGATION_MAPS.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_observador_presente.txt | stub (existente) | server/assets/modulos_filosoficos/eco_observador_presente.txt | ContextBuilder intents/gating; Gatilhos estoicos; Matriz base de módulos |
| eco_passive_signals.txt | stub (existente) | server/assets/modulos_core/eco_passive_signals.txt | referenciado em server/routes/feedbackRoutes.ts; referenciado em server/routes/promptRoutes.ts |
| ECO_PHILOSOPHICAL_STANCE.txt | stub (existente) | server/assets/modulos_core/ECO_PHILOSOPHICAL_STANCE.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_policy_config.txt | stub (existente) | server/assets/modulos_core/eco_policy_config.txt | referenciado em server/services/conversation/responsePlanner.ts |
| eco_presenca_racional.txt | stub (existente) | server/assets/modulos_filosoficos/eco_presenca_racional.txt | ContextBuilder intents/gating; Gatilhos estoicos; Matriz base de módulos |
| ECO_QUALITY_CHECKLIST.txt | stub (existente) | server/assets/modulos_core/ECO_QUALITY_CHECKLIST.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_QUESTION_TYPOLOGY.txt | stub (existente) | server/assets/modulos_core/ECO_QUESTION_TYPOLOGY.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RESPONSE_PLAN_COACH.txt | stub (existente) | server/assets/modulos_core/ECO_RESPONSE_PLAN_COACH.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RESPONSE_PLAN_ESPELHO.txt | stub (existente) | server/assets/modulos_core/ECO_RESPONSE_PLAN_ESPELHO.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RESPONSE_PLAN_EXPLORACAO.txt | stub (existente) | server/assets/modulos_core/ECO_RESPONSE_PLAN_EXPLORACAO.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RESPONSE_PLAN_PARADOXO.txt | stub (existente) | server/assets/modulos_core/ECO_RESPONSE_PLAN_PARADOXO.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RHYTHM_AND_PACING.txt | stub (existente) | server/assets/modulos_core/ECO_RHYTHM_AND_PACING.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_RULE_WEIGHTS.txt | stub (existente) | server/assets/modulos_core/ECO_RULE_WEIGHTS.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ECO_STYLE_GUIDE.txt | stub (existente) | server/assets/modulos_core/ECO_STYLE_GUIDE.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| eco_vulnerabilidade_defesas.txt | presente | server/assets/modulos_emocionais/eco_vulnerabilidade_defesas.txt | ContextBuilder intents/gating; Gatilhos emocionais; Matriz base de módulos |
| eco_vulnerabilidade_mitos.txt | presente | server/assets/modulos_emocionais/eco_vulnerabilidade_mitos.txt | ContextBuilder intents/gating; Gatilhos emocionais; Matriz base de módulos |
| ECO_WISDOM_PRINCIPLES.txt | stub (existente) | server/assets/modulos_core/ECO_WISDOM_PRINCIPLES.txt | referenciado em server/services/promptContext/instructionPolicy.ts |
| ENCERRAMENTO_SENSIVEL_full.txt | stub (existente) | server/assets/modulos_core/ENCERRAMENTO_SENSIVEL_full.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| ENCERRAMENTO_SENSIVEL_mini.txt | stub (existente) | server/assets/modulos_core/ENCERRAMENTO_SENSIVEL_mini.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| ENCERRAMENTO_SENSIVEL_rules.txt | stub (existente) | server/assets/modulos_core/ENCERRAMENTO_SENSIVEL_rules.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| ENCERRAMENTO_SENSIVEL.txt | presente | server/assets/modulos_core/ENCERRAMENTO_SENSIVEL.txt | Matriz base de módulos; referenciado em server/services/orchestrator/bandits/ts.ts; referenciado em server/services/promptContext/stitcher.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ModuleSelection.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| escala_abertura_1a3.txt | presente | server/assets/modulos_extras/escala_abertura_1a3.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ContextBuilder.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| ESCALA_INTENSIDADE_0a10.txt | presente | server/assets/modulos_extras/ESCALA_INTENSIDADE_0a10.txt | Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| GUEST_MESSAGE_TOO_LONG.txt | stub (existente) | server/assets/modulos_core/GUEST_MESSAGE_TOO_LONG.txt | referenciado em server/routes/askEco/requestParsing.ts |
| IDENTIDADE_min.txt | stub (existente) | server/assets/modulos_core/IDENTIDADE_min.txt | Frontend legacy context builder |
| identidade_mini.txt | presente | server/assets/modulos_core/identidade_mini.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/services/promptContext/baseSelection.ts; referenciado em server/services/promptContext/stitcher.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ContextBuilder.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| INTERNAL_ERROR.txt | stub (existente) | server/assets/modulos_core/INTERNAL_ERROR.txt | referenciado em server/routes/promptRoutes.ts; referenciado em server/services/ConversationOrchestrator.ts |
| LIMIT_FILE_SIZE.txt | stub (existente) | server/assets/modulos_core/LIMIT_FILE_SIZE.txt | referenciado em server/routes/voiceFullRoutes.ts |
| LINGUAGEM_NATURAL_full.txt | stub (existente) | server/assets/modulos_core/LINGUAGEM_NATURAL_full.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| LINGUAGEM_NATURAL_mini.txt | stub (existente) | server/assets/modulos_core/LINGUAGEM_NATURAL_mini.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| LINGUAGEM_NATURAL_rules.txt | stub (existente) | server/assets/modulos_core/LINGUAGEM_NATURAL_rules.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/conversation/responseFinalizer.q.test.ts |
| LINGUAGEM_NATURAL.txt | stub (existente) | server/assets/modulos_core/LINGUAGEM_NATURAL.txt | Matriz base de módulos; referenciado em server/services/orchestrator/bandits/ts.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/conversation/responseFinalizer.q.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| MEMORIA_COSTURA_REGRAS.txt | presente | server/assets/modulos_core/MEMORIA_COSTURA_REGRAS.txt | ContextBuilder intents/gating |
| METODO_VIVA_ENXUTO_min.txt | stub (existente) | server/assets/modulos_core/METODO_VIVA_ENXUTO_min.txt | Frontend legacy context builder |
| metodo_viva_enxuto.txt | presente | server/assets/modulos_extras/metodo_viva_enxuto.txt | ContextBuilder intents/gating; Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/ModuleSelection.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| MISSING_GUEST_ID.txt | stub (existente) | server/assets/modulos_core/MISSING_GUEST_ID.txt | referenciado em server/routes/promptRoutes.ts |
| MODULACAO_TOM_REGISTRO_full.txt | stub (existente) | server/assets/modulos_core/MODULACAO_TOM_REGISTRO_full.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| MODULACAO_TOM_REGISTRO_mini.txt | stub (existente) | server/assets/modulos_core/MODULACAO_TOM_REGISTRO_mini.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| MODULACAO_TOM_REGISTRO_rules.txt | stub (existente) | server/assets/modulos_core/MODULACAO_TOM_REGISTRO_rules.txt | referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts |
| MODULACAO_TOM_REGISTRO.txt | presente | server/assets/modulos_core/MODULACAO_TOM_REGISTRO.txt | Matriz base de módulos; referenciado em server/services/orchestrator/bandits/ts.ts; referenciado em server/services/promptContext/stitcher.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| OPENROUTER_API_KEY.txt | stub (existente) | server/assets/modulos_core/OPENROUTER_API_KEY.txt | referenciado em server/services/ConversationOrchestrator.ts |
| ORIENTACAO_GROUNDING.txt | stub (existente) | server/assets/modulos_core/ORIENTACAO_GROUNDING.txt | Gatilhos de regulação |
| PRINCIPIOS_CHAVE.txt | presente | server/assets/modulos_core/PRINCIPIOS_CHAVE.txt | Matriz base de módulos; referenciado em server/services/promptContext/budget.ts; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
| RESPIRACAO_GUIADA_BOX.txt | stub (existente) | server/assets/modulos_core/RESPIRACAO_GUIADA_BOX.txt | Gatilhos de regulação |
| SINTETIZADOR_PADRAO.txt | presente | server/assets/modulos_core/SINTETIZADOR_PADRAO.txt | ContextBuilder intents/gating |
| SUPABASE_ANON_KEY.txt | stub (existente) | server/assets/modulos_core/SUPABASE_ANON_KEY.txt | referenciado em server/services/ConversationOrchestrator.ts |
| SUPABASE_URL.txt | stub (existente) | server/assets/modulos_core/SUPABASE_URL.txt | referenciado em server/services/ConversationOrchestrator.ts |
| UPSTREAM_ERROR.txt | stub (existente) | server/assets/modulos_core/UPSTREAM_ERROR.txt | referenciado em server/services/ConversationOrchestrator.ts |
| usomemorias.txt | stub (existente) | server/assets/modulos_core/usomemorias.txt | ContextBuilder intents/gating; Frontend legacy context builder; Matriz base de módulos; referenciado em server/tests/conversation/promptPlan.bandit.integration.test.ts; referenciado em server/tests/promptContext/montarContextoEco.knapsack.test.ts |
