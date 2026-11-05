/** One question in the FAQ accordion. */
export interface FaqItem {
  question: string;
  answer: string;
}

export const faq: FaqItem[] = [
  {
    question: "Is there a hosted bot I can invite?",
    answer:
      "No. You run your own copy with your own Discord application, and the models run on hardware you control.",
  },
  {
    question: "Which models can I use?",
    answer:
      "Any model you have pulled into Ollama. For images, pull a vision model like llava or qwen2.5vl and pick it with the model option.",
  },
  {
    question: "Does it read every message?",
    answer:
      "No. It only answers slash commands, does not request the Message Content intent, and never pings users or roles.",
  },
  {
    question: "Can it use several machines?",
    answer:
      "Yes. List several Ollama or AUTOMATIC1111 URLs. They are tried in priority order, and requests wait in a fair queue when all are busy.",
  },
  {
    question: "Do I need a GPU?",
    answer:
      "The bot itself does not. Ollama and AUTOMATIC1111 do the heavy lifting, so their hardware requirements apply.",
  },
  {
    question: "Where is chat history stored?",
    answer:
      "In a local SQLite file, ./data/chat-history.db by default. Each person keeps their last 50 messages per channel.",
  },
];
