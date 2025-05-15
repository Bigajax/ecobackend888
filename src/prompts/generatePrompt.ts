// src/prompts/generatePrompt.ts

// Importação dos arquivos de texto com as instruções da IA ECO
import ecoCore from '../eco_prompts/eco_core_personality.txt';
import ecoEmotions from '../eco_prompts/eco_emotions.txt';
import ecoExamples from '../eco_prompts/eco_examples_realistic.txt';
import ecoFarewell from '../eco_prompts/eco_farewell.txt';
import ecoForbidden from '../eco_prompts/eco_forbidden_patterns.txt';
import ecoGeneric from '../eco_prompts/eco_generic_inputs.txt';
import ecoGuidelines from '../eco_prompts/eco_guidelines_general.txt';
import ecoManifesto from '../eco_prompts/eco_manifesto_fonte.txt';
import ecoPrincipios from '../eco_prompts/eco_principios_poeticos.txt';
import ecoBehavioral from '../eco_prompts/eco_behavioral_instructions.txt'; // NOVO ARQUIVO

// Função que une todos os blocos em um único Prompt Mestre
export const gerarPromptMestre = (): string => {
  return [
    `## MANIFESTO FONTE DA ECO

${ecoManifesto}

## PRINCÍPIOS POÉTICOS DA ECO

${ecoPrincipios}

## INSTRUÇÕES COMPORTAMENTAIS DA ECO

${ecoBehavioral}

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
