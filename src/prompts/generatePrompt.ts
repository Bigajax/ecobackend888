// src/prompts/generatePrompt.ts

// Importação dos arquivos Markdown com as instruções da IA ECO
import ecoCore from '../eco_prompts/eco_core_personality.md';
import ecoEmotions from '../eco_prompts/eco_emotions.md';
import ecoExamples from '../eco_prompts/eco_examples_realistic.md';
import ecoFarewell from '../eco_prompts/eco_farewell.md';
import ecoForbidden from '../eco_prompts/eco_forbidden_patterns.md';
import ecoGeneric from '../eco_prompts/eco_generic_inputs.md';
import ecoGuidelines from '../eco_prompts/eco_guidelines_general.md';

// Função que une todos os blocos em um único Prompt Mestre
export const gerarPromptMestre = (): string => {
  return [
    ecoCore,
    ecoGuidelines,
    ecoEmotions,
    ecoExamples,
    ecoGeneric,
    ecoForbidden,
    ecoFarewell,
  ].join('\n\n');
};
