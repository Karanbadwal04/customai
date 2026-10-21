import { SarvamAIClient } from "sarvamai";
import dotenv from "dotenv";
dotenv.config();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

async function synth(text) {
  const t0 = Date.now();
  const res = await sarvam.textToSpeech.convert({
    inputs: [text],
    target_language_code: "hi-IN",
    speaker: "ishita_enhi_customer",
    model: "bulbul:v4-flash",
    speech_sample_rate: 8000,
    pace: 1.15
  });
  return { ms: Date.now() - t0, bytes: res.audios[0]?.length };
}

async function run() {
  const fullText = "Achha great Doctor, hope aapke liye useful rahega. Kya toolkit ko lekar koi question hai?";
  const chunk1 = "Achha great Doctor, hope aapke liye useful rahega.";
  const chunk2 = "Kya toolkit ko lekar koi question hai?";

  console.log("--- Test A: Synthesizing FULL text in single call ---");
  const t0 = Date.now();
  const resSingle = await synth(fullText);
  console.log(`Single call took: ${resSingle.ms}ms`);

  console.log("\n--- Test B: Synthesizing Chunk 1 and Chunk 2 in PARALLEL ---");
  const t1 = Date.now();
  const [res1, res2] = await Promise.all([synth(chunk1), synth(chunk2)]);
  console.log(`Chunk 1: ${res1.ms}ms | Chunk 2: ${res2.ms}ms | Parallel total: ${Date.now() - t1}ms`);
}

run();
