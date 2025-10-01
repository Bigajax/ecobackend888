export interface DecodedSseChunk {
  event?: string;
  data?: string;
}

export function decodeSseChunk(raw: string): DecodedSseChunk[] {
  const events: DecodedSseChunk[] = [];
  const segments = raw.split(/\n\n/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const lines = trimmed.split(/\r?\n/);
    let eventName: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith(":")) {
        // LATENCY: ignora heartbeats mantendo o buffer enxuto.
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) continue;
    events.push({ event: eventName, data: dataLines.join("\n") });
  }

  return events;
}
