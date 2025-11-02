import { StreamSession } from "../../routes/askEco/streaming";
import { Writable } from "stream";

class MockResponse extends Writable {
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // Suppress console output
    callback();
  }
}

test("StreamSession should handle out-of-order, duplicate, and empty chunks gracefully", () => {
  const req = {};
  const res = new MockResponse();
  const streamId = "test-stream-123";
  const session = new StreamSession(req, res, streamId);

  const chunks = [
    { id: 1, data: "Hello" },
    { id: 0, data: "Hi" },
    { id: 3, data: "World" },
    { id: 2, data: " " },
    { id: 1, data: "Hello" },
    { data: "[DONE]" },
  ];

  const originalSend = (session as any).send;
  const sentData: string[] = [];
  (session as any).send = (payload: string) => {
    sentData.push(payload);
  };

  chunks.forEach((chunk) => session.handleChunk(chunk));

  const expectedOrder = [
    "id: 0\ndata: Hi\n\n",
    "id: 1\ndata: Hello\n\n",
    "id: 2\ndata:  \n\n",
    "id: 3\ndata: World\n\n",
    "data: [DONE]\n\n",
  ];

  expect(sentData).toEqual(expectedOrder);
});
