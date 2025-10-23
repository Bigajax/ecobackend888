interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "eco";
}

describe("chat message sequencing", () => {
  it("keeps the user message before the eco reply in state and payload", () => {
    let messages: ChatMessage[] = [
      { id: "seed", text: "Mensagem inicial da Eco", sender: "eco" },
    ];

    const setMessages = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messages = updater(messages);
      return messages;
    };

    const userMsg: ChatMessage = {
      id: "user-1",
      text: "Oi, tudo bem?",
      sender: "user",
    };

    let nextMessages: ChatMessage[] | undefined;
    setMessages((prev) => {
      const next = [...prev, userMsg];
      nextMessages = next;
      return next;
    });

    expect(messages).toEqual([
      { id: "seed", text: "Mensagem inicial da Eco", sender: "eco" },
      userMsg,
    ]);
    expect(nextMessages).toEqual(messages);

    const payloadRoles = (nextMessages ?? messages).map((msg) => msg.sender);
    expect(payloadRoles).toEqual(["eco", "user"]);

    const ecoMsg: ChatMessage = {
      id: "eco-1",
      text: "Estou bem! Em que posso ajudar?",
      sender: "eco",
    };

    setMessages((prev) => [...prev, ecoMsg]);

    expect(messages).toEqual([
      { id: "seed", text: "Mensagem inicial da Eco", sender: "eco" },
      userMsg,
      ecoMsg,
    ]);
  });
});
