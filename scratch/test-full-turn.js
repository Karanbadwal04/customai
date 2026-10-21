import { SarvamAIClient } from "sarvamai";
import dotenv from "dotenv";
dotenv.config();

const sarvam = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

function ensureCompleteSentence(text) {
  if (!text) return "";
  const trimmed = text.trim();
  if (/[.!?।]$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^([\s\S]*[.!?।])\s*[^.!?।]*$/);
  if (match && match[1] && match[1].trim().length > 15) {
    return match[1].trim();
  }

  return trimmed + ".";
}

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
  return { audioId: "test-id", ttsMs: Date.now() - t0 };
}

async function streamChatAndSynthesize(messages, languageCode, speaker) {
  const t0 = Date.now();
  let fullText = "";
  let chunk1Text = "";
  let chunk2Text = "";
  let chunk1Promise = null;
  let chunk2Promise = null;
  let chunk1Fired = false;
  let firstTokenMs = 0;

  const sentenceBoundaryRegex = /(?<!\b(Dr|Mr|Mrs|Ms|Prof|vs))\s*([.!?।\n]+)(\s+)/i;

  try {
    const stream = await sarvam.chat.completions({
      model: process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations",
      messages: messages,
      max_tokens: 75,
      temperature: 0.2,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (!delta) continue;
      if (!firstTokenMs) firstTokenMs = Date.now() - t0;
      fullText += delta;

      if (!chunk1Fired && sentenceBoundaryRegex.test(fullText)) {
        chunk1Fired = true;
        const match = fullText.match(/(?<!\b(Dr|Mr|Mrs|Ms|Prof|vs))\s*([.!?।\n]+)(\s+|$)/i);
        if (match && match.index !== undefined) {
          const splitIndex = match.index + match[0].length;
          chunk1Text = fullText.slice(0, splitIndex).replace(/\[HANGUP\]/gi, "").trim();
          if (chunk1Text.length > 0) {
            console.log(`⚡ [Stream 1st Clause at ${Date.now() - t0}ms]: "${chunk1Text}"`);
            chunk1Promise = synth(chunk1Text);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Sarvam Stream Chat Error]:", err.message);
  }

  const chatMs = Date.now() - t0;
  console.log(`[Sarvam Stream Complete (${chatMs}ms)]: "${fullText.trim()}"`);

  if (!fullText.trim()) {
    fullText = "Ji Doctor, samajh gayi.";
  }

  const cleanReplyText = ensureCompleteSentence(fullText.replace(/\[HANGUP\]/gi, "").trim());

  if (chunk1Fired && chunk1Text.length > 0) {
    const rawChunk2 = cleanReplyText.slice(chunk1Text.length).replace(/^[.,!?।\s]+/, "").trim();
    chunk2Text = ensureCompleteSentence(rawChunk2);
    if (chunk2Text.length > 0) {
      console.log(`⚡ [Stream Remainder Clause at ${Date.now() - t0}ms]: "${chunk2Text}"`);
      chunk2Promise = synth(chunk2Text);
    }
  } else {
    chunk1Text = cleanReplyText;
    console.log(`[Sarvam TTS Single Chunk at ${Date.now() - t0}ms]: "${chunk1Text}"`);
    chunk1Promise = synth(chunk1Text);
  }

  const ttsT0 = Date.now();
  const [res1, res2] = await Promise.all([
    chunk1Promise || Promise.resolve({ audioId: null, ttsMs: 0 }),
    chunk2Promise || Promise.resolve(null),
  ]);
  const ttsMs = Date.now() - ttsT0;

  const audioIds = [];
  if (res1?.audioId) audioIds.push(res1.audioId);
  if (res2?.audioId) audioIds.push(res2.audioId);

  return {
    replyText: fullText.trim(),
    cleanReplyText,
    audioIds,
    chatMs,
    ttsMs,
    totalTurnMs: chatMs + ttsMs
  };
}

async function run() {
  const result = await streamChatAndSynthesize([
    { role: "system", content: "You are Diya from Career Plan B. Reply in 1 short conversational Hinglish sentence." },
    { role: "user", content: "Ji haan, aap kaun?" }
  ]);
  console.log("\n✅ SUCCESS! Return object:", result);
}

run();
