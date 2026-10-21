import { SarvamAIClient } from "sarvamai";
import dotenv from "dotenv";
dotenv.config();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

async function run() {
  const model = process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations";
  const messages = [
    { role: "system", content: "You are Diya. Answer in one crisp Hinglish sentence under 10 words." },
    { role: "user", content: "Haan mil gaya toolkit" }
  ];

  console.log("--- 1. Testing NON-STREAMING ---");
  const t0 = Date.now();
  const res = await sarvam.chat.completions({
    model,
    messages,
    max_tokens: 35,
    temperature: 0.2,
  });
  const nonStreamTime = Date.now() - t0;
  console.log(`Non-streaming took: ${nonStreamTime}ms | Reply: "${res.choices[0]?.message?.content}"`);

  console.log("\n--- 2. Testing STREAMING with First Clause/Sentence Extraction ---");
  const t1 = Date.now();
  const stream = await sarvam.chat.completions({
    model,
    messages,
    max_tokens: 35,
    temperature: 0.2,
    stream: true,
  });

  let firstSentenceTime = null;
  let fullTime = null;
  let buffer = "";
  let firstSentence = "";

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    buffer += delta;
    // Check if buffer has sentence delimiter: punctuation (. , ! ? | । \n) or at least 5 words
    if (!firstSentence && (/[.,!?।|\n]/.test(buffer) || buffer.trim().split(/\s+/).length >= 5)) {
      firstSentenceTime = Date.now() - t1;
      firstSentence = buffer.trim();
      console.log(`⚡ First chunk/sentence ready at: ${firstSentenceTime}ms -> "${firstSentence}"`);
    }
  }
  fullTime = Date.now() - t1;
  console.log(`Full stream finished at: ${fullTime}ms | Total text: "${buffer.trim()}"`);
}

run();
