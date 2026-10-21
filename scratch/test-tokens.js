import { SarvamAIClient } from "sarvamai";
import dotenv from "dotenv";
dotenv.config();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

async function run() {
  const model = process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations";
  const systemPrompt = `You are Diya, caller from Career Plan B. You call doctors regarding NEET PG counselling toolkit.
CRITICAL RULE: Always speak in complete sentences. Never cut off mid-thought. Keep your response to 1 or 2 complete, natural sentences.`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "maine apne mere ko call kyu kiya?" }
  ];

  console.log("--- Test 1: max_tokens = 35 ---");
  const t0 = Date.now();
  const res35 = await sarvam.chat.completions({
    model,
    messages,
    max_tokens: 35,
    temperature: 0.2
  });
  console.log(`Tokens: 35 | Time: ${Date.now() - t0}ms`);
  console.log(`Reply: "${res35.choices[0]?.message?.content}"`);

  console.log("\n--- Test 2: max_tokens = 75 ---");
  const t1 = Date.now();
  const res75 = await sarvam.chat.completions({
    model,
    messages,
    max_tokens: 75,
    temperature: 0.2
  });
  console.log(`Tokens: 75 | Time: ${Date.now() - t1}ms`);
  console.log(`Reply: "${res75.choices[0]?.message?.content}"`);
}

run();
