import "dotenv/config";
import { SarvamAIClient } from "sarvamai";

const sarvam = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });

const prompt = `ROLE: Diya from Career Plan B speaking in warm, natural Hinglish.

NATURAL CONVERSATION RULES:
- STRICT RULE: DO NOT start every response with "Doctor" or "Ji Doctor". That sounds robotic. You already know they are a doctor. Address them with natural respect using "aap" / "ji" just like a real person.
- Speak warmly, casually, and professionally.
- Keep replies short (10-18 words, max 1-2 short sentences).
- Topic: Checking if they received the NEET PG WhatsApp toolkit, answering basic doubts, or offering a free expert counsellor callback.`;

async function test() {
  const messages = [
    { role: "system", content: prompt },
    { role: "assistant", content: "Hello, kya meri baat Doctor se ho rahi hai?" },
    { role: "user", content: "Haanji boliye, kaun baat kar raha hai?" }
  ];

  const res1 = await sarvam.chat.completions({
    model: "sarvam-105b-conversations",
    messages,
    temperature: 0.4,
  });

  console.log("Turn 1 Reply:\n", res1.choices[0].message.content);

  messages.push(res1.choices[0].message);
  messages.push({ role: "user", content: "Haan WhatsApp pe toh aaya tha, par maine dekha nahi abhi." });

  const res2 = await sarvam.chat.completions({
    model: "sarvam-105b-conversations",
    messages,
    temperature: 0.4,
  });

  console.log("Turn 2 Reply:\n", res2.choices[0].message.content);
}

test().catch(console.error);
