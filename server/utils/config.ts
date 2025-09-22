export const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
export const MAX_PROMPT_TOKENS = Number(process.env.ECO_MAX_PROMPT_TOKENS ?? 8000);
export const NIVEL1_BUDGET = Number(process.env.ECO_NIVEL1_BUDGET ?? 2500);
export const HARD_CAP_EXTRAS = 6;

export const TIMEOUT_FUZZY_MS = 1500;
export const TIMEOUT_EMB_MS = 2200;
export const TIMEOUT_MEM_MS = 2200;
export const TIMEOUT_ENC_MS = 2000;
export const MARGIN_TOKENS = 256;

export const MAX_LEN_FOR_GREETING = 40;
export const GREET_RE =
  /^(?:(?:oi+|oie+|ola+|ol[aá]|alo+|opa+|salve)(?:[, ]*(?:tudo\s*bem|td\s*bem))?|tudo\s*(?:bem|bom|certo)|oi+[, ]*tudo\s*bem|ol[aá]\s*eco|oi\s*eco|oie\s*eco|ola\s*eco|alo\s*eco|bom\s*dia+|boa\s*tarde+|boa\s*noite+|boa\s*madrugada+|e\s*a[ei]|e\s*a[ií]\??|eai|eae|fala(?:\s*ai)?|falae|hey+|hi+|hello+|yo+|sup|beleza|blz|suave|de\s*boa|tranq(?:s)?|tranquilo(?:\s*ai)?|como\s*(?:vai|vc\s*esta|voce\s*esta|ce\s*ta|c[eu]\s*ta))(?:[\s,]*(@?eco|eco|bot|assistente|ai|chat))?\s*[!?.…]*$/i;
