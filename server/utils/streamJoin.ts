import path from "path";

type SmartJoinFn = (accumulated: string, incoming: string) => string;

let cached: SmartJoinFn | null = null;

function loadSmartJoin(): SmartJoinFn {
  if (cached) {
    return cached;
  }

  const modulePath = path.join(process.cwd(), "src/utils/streamJoin");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(modulePath) as { smartJoin?: SmartJoinFn };
  if (typeof mod.smartJoin !== "function") {
    throw new Error("smartJoin export missing in src/utils/streamJoin");
  }
  cached = mod.smartJoin;
  return cached;
}

export function smartJoin(accumulated: string, incoming: string): string {
  return loadSmartJoin()(accumulated, incoming);
}
