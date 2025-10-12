// server/services/promptContext/Selector.ts

import {
  detectarSaudacaoBreve,
  derivarFlags,
  derivarNivel,
  estimarIntensidade0a10,
  type Flags,
} from "./flags";
import {
  selecionarModulosBase,
  type BaseSelection,
  type ModuleDebugEntry,
} from "./baseSelection";
import {
  applyModuleMetadata,
  type DecSnapshot,
  type ModuleSelectionDebugEntry,
  type PreparedModule,
} from "./moduleMetadata";

export {
  detectarSaudacaoBreve,
  derivarFlags,
  derivarNivel,
  estimarIntensidade0a10,
  selecionarModulosBase,
  applyModuleMetadata,
};

export type {
  Flags,
  BaseSelection,
  ModuleDebugEntry,
  ModuleSelectionDebugEntry,
  DecSnapshot,
  PreparedModule,
};

export const Selector = {
  derivarFlags,
  selecionarModulosBase,
  applyModuleMetadata,
};

export default Selector;
