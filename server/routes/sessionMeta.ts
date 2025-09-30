import type { SessionMetadata } from "../utils";

type AnyRecord = Record<string, unknown>;

const pickString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const pickNullableString = (...values: unknown[]): string | null | undefined => {
  const picked = pickString(...values);
  return picked ?? undefined;
};

const possibleContainers = [
  "sessionMeta",
  "session_meta",
  "session",
  "sessaoMeta",
  "sessao_meta",
  "sessao",
  "metaSessao",
  "meta_sessao",
  "metadadosSessao",
  "metadados_sessao",
  "metadata",
];

export function extractSessionMeta(payload: AnyRecord | null | undefined): SessionMetadata | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  let container: AnyRecord | undefined;
  for (const key of possibleContainers) {
    const value = (payload as AnyRecord)[key];
    if (value && typeof value === "object") {
      container = value as AnyRecord;
      break;
    }
  }

  const source = container ?? payload;

  const distinctId = pickString(
    (source as AnyRecord).distinctId,
    (source as AnyRecord).distinct_id,
    (source as AnyRecord).distinctID,
    (source as AnyRecord).mpDistinctId,
    (payload as AnyRecord).distinctId,
    (payload as AnyRecord).distinct_id
  );

  const versaoApp = pickNullableString(
    (source as AnyRecord).versaoApp,
    (source as AnyRecord).versao_app,
    (source as AnyRecord).appVersion
  );
  const device = pickNullableString(
    (source as AnyRecord).device,
    (source as AnyRecord).dispositivo,
    (source as AnyRecord).device_name
  );
  const ambiente = pickNullableString(
    (source as AnyRecord).ambiente,
    (source as AnyRecord).environment,
    (source as AnyRecord).env
  );

  const hasAny = distinctId || versaoApp || device || ambiente;
  if (!hasAny) return undefined;

  return {
    distinctId,
    versaoApp: versaoApp ?? null,
    device: device ?? null,
    ambiente: ambiente ?? null,
  } as SessionMetadata;
}
