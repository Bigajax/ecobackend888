// src/prompts/generatePrompt.ts

// Importação dos arquivos Markdown com as instruções da IA ECO
import ecoCore from '../eco_prompts/eco_core_personality.md';
import ecoEmotions from '../eco_prompts/eco_emotions.md';
import ecoExamples from '../eco_prompts/eco_examples_realistic.md';
import ecoFarewell from '../eco_prompts/eco_farewell.md';
import ecoForbidden from '../eco_prompts/eco_forbidden_patterns.md';
import ecoGeneric from '../eco_prompts/eco_generic_inputs.md';
import ecoGuidelines from '../eco_prompts/eco_guidelines_general.md';
import ecoManifesto from '../eco_prompts/eco_manifesto_fonte.md'; // Importe o manifesto
import ecoPrincipios from '../eco_prompts/eco_principios_poeticos.md'; // Importe os princípios

// Função que une todos os blocos em um único Prompt Mestre
export const gerarPromptMestre = (): string => {
  return [
    `## MANIFESTO FONTE DA ECO

${ecoManifesto}

## PRINCÍPIOS POÉTICOS DA ECO

${ecoPrincipios}

## PERSONALIDADE PRINCIPAL DA ECO

${ecoCore}

## DIRETRIZES GERAIS DA ECO

${ecoGuidelines}

## EMOÇÕES DA ECO

${ecoEmotions}

## EXEMPLOS REALÍSTICOS DA ECO

${ecoExamples}

## ENTRADAS GENÉRICAS DA ECO

${ecoGeneric}

## PADRÕES PROIBIDOS DA ECO

${ecoForbidden}

## DESPEDIDA DA ECO

${ecoFarewell}`,
  ].join('\n\n');
};