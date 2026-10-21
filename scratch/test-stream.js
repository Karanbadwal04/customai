import { SarvamAIClient } from "sarvamai";
import dotenv from "dotenv";
dotenv.config();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

async function run() {
  console.log("Testing Sarvam streaming with model:", process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations");
  const t0 = Date.now();
  try {
    const stream = await sarvam.chat.completions({
      model: process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations",
      messages: [
        { role: "system", content: "You are Diya. Speak in short Hinglish." },
        { role: "user", content: "Kya counselling ka toolkit mil gaya?" }
      ],
      max_tokens: 35,
      temperature: 0.2,
      stream: true,
    });

    let firstTokenTime = null;
    let fullText = "";
    let chunkCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content || "";
      if (content) {
        chunkCount++;
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - t0;
          console.log(`⚡ Time to First Token (TTFT): ${firstTokenTime}ms`);
        }
        fullText += content;
        process.stdout.write(content);
      }
    }
    const totalTime = Date.now() - t0;
    console.log(`\n\nTotal time: ${totalTime}ms | Chunks: ${chunkCount} | Full text: "${fullText}"`);
  } catch (err) {
    console.error("Stream test error:", err);
  }
}

run();
