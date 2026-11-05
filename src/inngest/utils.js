export function lastAssistantTextMessageContent(result) {
  // Only consider assistant *text* messages. Tool-call messages have no
  // content, and picking one of those as "last" would hide the real text.
  const message = [...(result?.output ?? [])]
    .reverse()
    .find((m) => m.role === "assistant" && m.type === "text" && m.content);

  if (!message) return undefined;

  if (typeof message.content === "string") return message.content;

  // Content can be an array of parts; keep only the text ones.
  return message.content
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("");
}
