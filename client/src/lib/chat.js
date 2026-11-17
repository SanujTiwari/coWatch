export const mergeMessages = (current, incoming) => {
  const messages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};
