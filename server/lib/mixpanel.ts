import dotenv from "dotenv";
import mixpanel from "mixpanel";

dotenv.config(); // deixa o path padrão (raiz do projeto)

// Aceita várias vars para conveniência
const TOKEN =
  process.env.MIXPANEL_SERVER_TOKEN ||
  process.env.MIXPANEL_TOKEN ||
  process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ||
  "";

/** Interface mínima que sua app realmente usa */
export interface MinimalMixpanel {
  track(event: string, props?: Record<string, any>, cb?: (...a: any[]) => void): void;
  register(props: Record<string, any>, days?: number): void;
  register_once(
    props: Record<string, any>,
    defaultValue?: string | number | null,
    days?: number
  ): void;
  people: {
    set(id: string, props?: Record<string, any>, cb?: (...a: any[]) => void): void;
    set_once(id: string, props?: Record<string, any>, cb?: (...a: any[]) => void): void;
    increment(id: string, props?: Record<string, number>, cb?: (...a: any[]) => void): void;
  };
  alias?(alias: string, distinctId: string, cb?: (...a: any[]) => void): void;
  identify?(distinctId: string): void;
  import?(batch: any, cb?: (...a: any[]) => void): void;
}

/** Cliente no-op: não envia nada, mas respeita a tipagem */
class NoopMixpanel implements MinimalMixpanel {
  track(): void {
    if (process.env.NODE_ENV !== "production") {
      // console.warn("[mixpanel] track ignorado (TOKEN ausente)");
    }
  }
  register(): void {}
  register_once(): void {}
  people = {
    set: () => {},
    set_once: () => {},
    increment: () => {},
  };
  alias?(): void {}
  identify?(): void {}
  import?(): void {}
}

let mixpanelClient: MinimalMixpanel;

if (TOKEN) {
  // mixpanel.init retorna um tipo específico; fazemos um cast para nossa interface mínima
  mixpanelClient = mixpanel.init(TOKEN, { protocol: "https" }) as unknown as MinimalMixpanel;
} else {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[mixpanel] Desabilitado: nenhum token em MIXPANEL_SERVER_TOKEN/MIXPANEL_TOKEN.");
  }
  mixpanelClient = new NoopMixpanel();
}

export default mixpanelClient;
export const MIXPANEL_ENABLED = !!TOKEN;
