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
  return { ms: Date.now() - t0, audio: res.audios?.[0]?.length };
}

async function streamChatAndSynthesize(messages) {
  const overallT0 = Date.now();
  let fullText = "";
  let chunk1Text = "";
  let chunk2Text = "";
  let chunk1Promise = null;
  let chunk2Promise = null;
  let firstTokenMs = null;
  let chunk1Fired = false;

  const isSentenceEnd = (text) => {
    const trimmed = text.trim();
    if (/[.!?।\n]/.test(trimmed)) return true;
    const words = trimmed.split(/\s+/);
    if (words.length >= 6 && /[,;:]/.test(trimmed)) return true;
    return false;
  };

  console.log("1. Starting stream chat...");
  const stream = await sarvam.chat.completions({
    model: process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations",
    messages,
    max_tokens: 35,
    temperature: 0.2,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (!delta) continue;
    if (!firstTokenMs) firstTokenMs = Date.now() - overallT0;
    fullText += delta;

    if (!chunk1Fired && isSentenceEnd(fullText)) {
      chunk1Fired = true;
      chunk1Text = fullText.replace(/\[HANGUP\]/gi, "").trim();
      console.log(`⚡ [t = ${Date.now() - overallT0}ms] Chunk 1 detected: "${chunk1Text}" -> Firing TTS 1 in parallel!`);
      chunk1Promise = synth(chunk1Text);
    }
  }

  const chatDoneMs = Date.now() - overallT0;
  console.log(`⚡ [t = ${chatDoneMs}ms] Stream finished! Full text: "${fullText.trim()}"`);

  const cleanFullText = fullText.replace(/\[HANGUP\]/gi, "").trim();

  if (chunk1Fired) {
    chunk2Text = cleanFullText.slice(chunk1Text.length).replace(/^[.,!?।\s]+/, "").trim();
    if (chunk2Text.length > 0) {
      console.log(`⚡ [t = ${Date.now() - overallT0}ms] Chunk 2 detected: "${chunk2Text}" -> Firing TTS 2 in parallel!`);
      chunk2Promise = synth(chunk2Text);
    }
  } else {
    chunk1Text = cleanFullText;
    console.log(`⚡ [t = ${Date.now() - overallT0}ms] Single chunk: "${chunk1Text}" -> Firing TTS now!`);
    chunk1Promise = synth(chunk1Text);
  }

  const [res1, res2] = await Promise.all([
    chunk1Promise,
    chunk2Promise ? chunk2Promise : Promise.resolve(null),
  ]);

  const totalTime = Date.now() - overallT0;
  console.log(`\n🎉 Total Pipeline Time: ${totalTime}ms (from user speech to all audio ready)`);
  console.log(`Chunk 1 size: ${res1?.audio} bytes | Chunk 2 size: ${res2 ? res2.audio : 'none'}`);
}

async function run() {
  const messages = [
    { role: "system", content: "You are Diya, caller from Career Plan B. Reply in 1 or 2 conversational Hinglish sentences." },
    { role: "user", content: "Toolkit to mil gaya, lekin mujhe session nahi lena." }
  ];
  await streamChatAndSynthesize(messages);
}

run();
