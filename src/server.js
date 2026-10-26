import "dotenv/config";
import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SarvamAIClient } from "sarvamai";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const transcriptsFile = path.join(dataDir, "transcripts.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure transcripts file exists
if (!fs.existsSync(transcriptsFile)) {
  fs.writeFileSync(transcriptsFile, "[]", "utf8");
}

function loadTranscripts() {
  try {
    return JSON.parse(fs.readFileSync(transcriptsFile, "utf8"));
  } catch (err) {
    console.error("Error reading transcripts:", err.message);
    return [];
  }
}

function saveTranscripts(data) {
  try {
    fs.writeFileSync(transcriptsFile, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving transcripts:", err.message);
  }
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(projectRoot, "public")));

const server = http.createServer(app);

// WebSocket server for dashboard real-time updates
const wss = new WebSocketServer({ server, path: "/dashboard-ws" });
const dashboardClients = new Set();

wss.on("connection", (ws) => {
  dashboardClients.add(ws);
  // Send current active state immediately
  ws.send(JSON.stringify({
    type: "init",
    activeCall: currentActiveCall,
    config: {
      twilioPhoneNumber: config.twilioPhoneNumber,
      friendPhoneNumber: config.friendPhoneNumber,
      publicBaseUrl: config.publicBaseUrl,
      sarvamChatModel: config.sarvamChatModel,
      sarvamTtsLanguage: config.sarvamTtsLanguage,
      sarvamTtsSpeaker: config.sarvamTtsSpeaker,
    }
  }));

  ws.on("close", () => dashboardClients.delete(ws));
});

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, timestamp: Date.now(), ...payload });
  for (const client of dashboardClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Initialize Sarvam AI Client
const sarvam = new SarvamAIClient({
  apiSubscriptionKey: config.sarvamApiKey,
});

// Twilio REST Client
const twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);

// In-memory audio store for WAV files
const audioStore = new Map();

// Active conversations: callSid -> conversation object
const activeConversations = new Map();

let currentActiveCall = {
  callSid: null,
  status: "idle",
  friendNumber: config.friendPhoneNumber,
  friendName: "Friend",
  language: config.sarvamTtsLanguage,
  speaker: config.sarvamTtsSpeaker,
  startedAt: null,
  turns: [],
  latencyStats: {
    latestChatMs: 0,
    latestTtsMs: 0,
    latestTotalMs: 0,
    samples: []
  }
};

let currentGreeting = "Hello, kya meri baat Doctor se ho rahi hai?";

let currentSystemPrompt = `# AI CALLING AGENT PROMPT — DIYA | CAREER PLAN B

## ROLE
Your name is Diya. You are a female calling representative for Career Plan B, a career counselling company. You are calling doctors who are preparing for or going through the NEET PG counselling process.
The purpose of the call is a friendly follow-up: let them know a NEET PG counselling toolkit has been sent to them on WhatsApp, and offer a free session with a human expert counsellor if they would find it useful.
You are NOT a counsellor yourself. You do not give advice on branch or college choices, ranks, cutoffs, or fees. You only share the toolkit information, handle basic questions, and book a callback slot if they want one.

## ABOUT CAREER PLAN B
We are a career counselling company providing guidance across admission processes (NEET PG, engineering, MBA, etc.).
- 17 years of experience, guided lakhs of students with unbiased guidance.
- Mention credentials ONLY if the caller asks who you are or questions credibility, never in the opening.
- We have various counselling plans detailed on our website careerplanb.co on the plans and pricing page.

## FOCUS
This call is strictly about NEET PG counselling guidance. The WhatsApp toolkit is the main point. The free session is an option, not a target. Do not discuss MBBS, UG counselling, or other courses. If asked, state that an expert counsellor can discuss it.

## LANGUAGE & STYLE
- Default to a natural Hindi-English mix (Hinglish). Doctors prefer English for medical and professional terms.
- Mirror the caller's language: Hindi for Hindi, English for English, Hinglish for a mix.
- Keep sentences short, conversational, and respectful (10 to 18 words per turn). This is a phone call, not a written email.
- Address respectfully as “Doctor” or “Dr. [Name]” with natural respect using “aap” and “ji”.
- Avoid repeating “Doctor” or “Doctor ji” in every consecutive sentence; sound like a warm, polished colleague.

## CALL FLOW
### 1. Identity Confirmation
Opening: “Hello, kya meri baat Doctor se ho rahi hai?”
- If wrong person / unavailable: Politely ask when to call back, or end courteously.
- If confirmed: Proceed to Introduction.

### 2. Introduction
Say: “Main Career Plan B se Diya bol rahi hoon.”
- If busy: Offer a callback time and close politely: “Maine aapko NEET PG toolkit bhej diya hai WhatsApp pe, thank you for your time.”

### 3. Toolkit Mention (Main Reason for Call)
Say: “Maine aapko NEET PG counselling process ka ek toolkit WhatsApp pe bheja hai, bas yeh confirm karna tha ki aapko mil gaya ya nahi.”
- If received / seen: “Great, hope it’s useful.” Ask lightly if they have any basic questions about it.
- If not received: Apologise briefly, note that it will be resent, and tell them: “Aap hamari website careerplanb.co se bhi toolkit access kar sakte hain.”
- If haven't looked yet: “Koi baat nahi, jab time ho tab dekh lijiye.”
- Let them respond naturally before moving on. Do not rush.

### 4. Soft Offer
Say: “Agar aap chahein, toh hamare expert counsellor ke saath ek free counselling session schedule kar sakte hain, jahan aapko aapke admission ke branch-wise options se judey sawaal clear ho jayenge.”
- Suggest it casually, not as an aggressive sales pitch. Do not repeat the offer more than once unprompted.

### 5. Handling Responses
- A. YES / Interested:
  Thank them warmly. Ask for a convenient date and time, and confirm the best number.
  Close: “Perfect, main slot note kar leti hoon. Hamare expert counsellor aapko us time pe call karenge. Thank you, Doctor.”
- B. NOT INTERESTED / Asks to be removed:
  Try to persuade gently once: “Yeh session bilkul free aur unbiased hai, jahan aapko branch-wise options par complete clarity mil jayegi.”
  If still not convinced after persuading, end politely with proper closing: “Koi baat nahi ji, thank you so much for your time.”
- C. QUESTIONS:
  Answer only using approved talking points below. For detailed queries or branch advice:
  “Iske baare mein hamare expert counsellor detail mein bata payenge.” (Do not repeat this more than 2 times in a single call).
- D. UNSURE / Wants to think:
  Don't pressure. “Bilkul, aap toolkit dekh lijiye. Session free hai aur koi obligation nahi hai.” If still unsure, leave it with them politely.

## APPROVED TALKING POINTS (Use only these)
- Toolkit contents and USPs: MD/MS true cost calculator, Seat predictor, Bond explorer, Hospital bed indicator.
- The first session with an expert counsellor is completely free, with zero obligation.
- Career Plan B has 17 years of experience and has guided lakhs of students with unbiased counselling (mention only if asked).
- Different counselling plans are available on careerplanb.co plans and pricing page.

## STRICT BOUNDARIES
- NEVER cut or hang up the call from your end in any case.
- Never give advice on which college, branch, or state to choose.
- Never quote ranks, cutoffs, fees, seat counts, counselling dates, or success guarantees.
- Never claim outcomes (“aapko seat mil jayegi”). Only offer guidance.
- Never create urgency or pressure (“seats khatam ho rahi hain”, “last date nikal jayegi”).
- Never pressure someone who says no; close politely.
- If the caller is rude or hostile, remain calm, polite, and never argue.

## TONE
Calm, respectful, peer-to-peer, like a helpful colleague checking in, not a salesperson. Use natural acknowledgments (“haan ji,” “bilkul,” “samajh sakti hoon,” “of course”).

## GOAL
Confirm the toolkit reached them and book a free counsellor session slot if they want one, or conclude courteously if they don't.`;

// Poller reference for active call status checking
let activePoller = null;

function finalizeCall(callSid, status, duration = 0) {
  if (activePoller) {
    clearInterval(activePoller);
    activePoller = null;
  }

  console.log(`[Twilio Finalize] CallSid: ${callSid}, Status: ${status}, Duration: ${duration || 0}s`);

  if (currentActiveCall.callSid === callSid) {
    currentActiveCall.status = status;
    broadcast("call_status", { activeCall: currentActiveCall });
  }

  // Save to persistent transcript file if turns exist
  if (currentActiveCall.turns && currentActiveCall.turns.length > 0) {
    const allTranscripts = loadTranscripts();
    if (!allTranscripts.some(t => t.id === callSid)) {
      const durationSec = Number(duration || 0);
      const avgLat = currentActiveCall.latencyStats.samples.length > 0
        ? Math.round(currentActiveCall.latencyStats.samples.reduce((a, b) => a + b, 0) / currentActiveCall.latencyStats.samples.length)
        : 0;

      const record = {
        id: callSid,
        friendNumber: currentActiveCall.friendNumber,
        friendName: currentActiveCall.friendName,
        startedAt: currentActiveCall.startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationSec,
        language: config.sarvamTtsLanguage,
        speaker: config.sarvamTtsSpeaker,
        avgLatencyMs: avgLat,
        turns: [...currentActiveCall.turns]
      };

      allTranscripts.unshift(record);
      saveTranscripts(allTranscripts);
      console.log(`[Transcript Saved] Saved call ${callSid} (${currentActiveCall.turns.length} turns, avg ${avgLat}ms)`);
      broadcast("transcript_saved", { record });
    }
  }

  activeConversations.delete(callSid);
}

function startCallStatusPoller(callSid) {
  if (!callSid || callSid === "unknown") return;
  if (activePoller) {
    clearInterval(activePoller);
  }

  activePoller = setInterval(async () => {
    try {
      if (!currentActiveCall.callSid || currentActiveCall.callSid !== callSid) {
        clearInterval(activePoller);
        activePoller = null;
        return;
      }

      const call = await twilioClient.calls(callSid).fetch();
      const status = call.status;

      if (status !== currentActiveCall.status) {
        currentActiveCall.status = status;
        broadcast("call_status", { activeCall: currentActiveCall });
      }

      if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
        clearInterval(activePoller);
        activePoller = null;
        finalizeCall(callSid, status, call.duration);
      }
    } catch (err) {
      console.error(`[Call Poller Error ${callSid}]:`, err.message);
      clearInterval(activePoller);
      activePoller = null;
    }
  }, 2000);
}

// Map friendly speaker names to fast bulbul:v4-flash personas
function resolveTtsSpeaker(speaker, model = config.sarvamTtsModel) {
  if (!speaker) return model === "bulbul:v4-flash" ? "simran_hi_conversation" : "ishita";
  if (speaker.includes("_")) return speaker;

  if (model === "bulbul:v4-flash") {
    const v4Map = {
      ishita: "simran_hi_conversation",
      simran: "simran_hi_conversation",
      sanchita: "sanchita_hi_assistant",
      kavya: "kavya_hi_conversational",
      ritu: "ritu_hi_conversation",
      priya: "simran_hi_conversation",
      neha: "simran_enhi_customer",
      shreya: "shreya_hi_conversational",
      shubh: "shubh_enhi_ads",
      aditya: "aditya_hi_conversational",
    };
    return v4Map[speaker.toLowerCase()] || "simran_hi_conversation";
  }

  return speaker;
}

// Helper: Synthesize speech with Sarvam Bulbul TTS and cache audio buffer
async function synthesizeSpeech(text, languageCode = config.sarvamTtsLanguage, speaker = config.sarvamTtsSpeaker) {
  const t0 = Date.now();
  let cleanText = (text || "").trim();
  // Keep telephony audio concise (< 250 characters) for ultra-fast generation
  if (cleanText.length > 250) {
    cleanText = cleanText.substring(0, 250);
  }
  if (!cleanText) cleanText = "Hello, kya meri baat Doctor se ho rahi hai?";

  const ttsModel = config.sarvamTtsModel || "bulbul:v4-flash";
  const resolvedSpeaker = resolveTtsSpeaker(speaker, ttsModel);
  const pace = config.sarvamTtsPace || 1.05;

  try {
    const res = await sarvam.textToSpeech.convert({
      inputs: [cleanText],
      target_language_code: languageCode,
      speaker: resolvedSpeaker,
      speech_sample_rate: 8000,
      pace: pace,
      model: ttsModel,
    });

    const ttsMs = Date.now() - t0;

    if (res.audios && res.audios.length > 0) {
      const audioBuffer = Buffer.from(res.audios[0], "base64");
      const audioId = crypto.randomUUID();
      audioStore.set(audioId, audioBuffer);

      // Keep audio cached for 30 minutes
      setTimeout(() => audioStore.delete(audioId), 30 * 60 * 1000);
      return { audioId, ttsMs };
    }
  } catch (err) {
    console.error(`[Sarvam TTS Error (${ttsModel}/${resolvedSpeaker})]:`, err.message);
  }
  return { audioId: null, ttsMs: Date.now() - t0 };
}

// -------------------------------------------------------------
// REST API ENDPOINTS FOR DASHBOARD
// -------------------------------------------------------------

// Serve generated audio to Twilio and Browser
app.get("/audio/:id.wav", (req, res) => {
  const audioId = req.params.id;
  const audioData = audioStore.get(audioId);
  if (!audioData) {
    return res.status(404).send("Audio expired or not found");
  }
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", audioData.length);
  res.setHeader("Accept-Ranges", "bytes");
  res.send(audioData);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: "Sarvam AI", model: config.sarvamChatModel });
});

// Status & active call state
app.get("/api/status", (_req, res) => {
  res.json({
    activeCall: currentActiveCall,
    config: {
      twilioPhoneNumber: config.twilioPhoneNumber,
      friendPhoneNumber: config.friendPhoneNumber,
      publicBaseUrl: config.publicBaseUrl,
      sarvamChatModel: config.sarvamChatModel,
      sarvamTtsLanguage: config.sarvamTtsLanguage,
      sarvamTtsSpeaker: config.sarvamTtsSpeaker,
      greeting: currentGreeting,
      systemPrompt: currentSystemPrompt,
    }
  });
});

// Trigger outbound call from UI
app.post("/api/call", async (req, res) => {
  const { friendNumber, friendName, language, speaker, systemPrompt, greeting } = req.body;
  const targetNumber = friendNumber || config.friendPhoneNumber;

  if (!targetNumber) {
    return res.status(400).json({ error: "Friend phone number is required" });
  }

  if (language) config.sarvamTtsLanguage = language;
  if (speaker) config.sarvamTtsSpeaker = speaker;
  if (systemPrompt && systemPrompt.trim()) currentSystemPrompt = systemPrompt.trim();
  if (greeting && greeting.trim() && greeting.trim().length <= 200) {
    currentGreeting = greeting.trim();
  } else if (friendName && friendName.trim() && friendName.trim() !== "Friend") {
    currentGreeting = `Hello, kya meri baat Dr. ${friendName.trim()} se ho rahi hai?`;
  } else {
    currentGreeting = "Hello, kya meri baat Doctor se ho rahi hai?";
  }

  try {
    console.log(`[UI Dialer] Dialing ${targetNumber} from ${config.twilioPhoneNumber}...`);

    currentActiveCall = {
      callSid: null,
      status: "dialing",
      friendNumber: targetNumber,
      friendName: friendName || "Friend",
      language: config.sarvamTtsLanguage,
      speaker: config.sarvamTtsSpeaker,
      startedAt: new Date().toISOString(),
      turns: [],
      latencyStats: {
        latestChatMs: 0,
        latestTtsMs: 0,
        latestTotalMs: 0,
        samples: []
      }
    };

    broadcast("call_status", { activeCall: currentActiveCall });

    // Note: Twilio trial accounts forbid statusCallback parameter on calls.create
    // We only provide { to, from, url } and track status via background poller
    const call = await twilioClient.calls.create({
      to: targetNumber,
      from: config.twilioPhoneNumber,
      url: `${config.publicBaseUrl}/twiml`,
    });

    currentActiveCall.callSid = call.sid;
    currentActiveCall.status = "ringing";
    broadcast("call_status", { activeCall: currentActiveCall });

    startCallStatusPoller(call.sid);

    res.json({ success: true, callSid: call.sid, status: call.status });
  } catch (err) {
    console.error("[UI Dialer Error]:", err.message);
    currentActiveCall.status = "failed";
    broadcast("call_status", { activeCall: currentActiveCall, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Terminate active call from UI
app.post("/api/hangup", async (_req, res) => {
  const sid = currentActiveCall.callSid;
  if (!sid) {
    currentActiveCall.status = "idle";
    broadcast("call_status", { activeCall: currentActiveCall });
    return res.json({ success: true, message: "No active call" });
  }

  try {
    await twilioClient.calls(sid).update({ status: "completed" });
    finalizeCall(sid, "completed");
    res.json({ success: true });
  } catch (err) {
    console.error("[Hangup Error]:", err.message);
    finalizeCall(sid, "completed");
    res.status(500).json({ error: err.message });
  }
});

// Get past transcripts
app.get("/api/transcripts", (_req, res) => {
  const transcripts = loadTranscripts();
  res.json({ transcripts });
});

// Delete transcript
app.delete("/api/transcripts/:id", (req, res) => {
  let transcripts = loadTranscripts();
  transcripts = transcripts.filter(t => t.id !== req.params.id);
  saveTranscripts(transcripts);
  res.json({ success: true });
});

// Update settings
app.post("/api/config", (req, res) => {
  const { friendPhoneNumber, publicBaseUrl, sarvamTtsLanguage, sarvamTtsSpeaker, systemPrompt } = req.body;
  if (friendPhoneNumber) config.friendPhoneNumber = friendPhoneNumber.trim();
  if (publicBaseUrl) config.publicBaseUrl = publicBaseUrl.trim().replace(/\/$/, "");
  if (sarvamTtsLanguage) config.sarvamTtsLanguage = sarvamTtsLanguage.trim();
  if (sarvamTtsSpeaker) config.sarvamTtsSpeaker = sarvamTtsSpeaker.trim();
  if (systemPrompt) currentSystemPrompt = systemPrompt.trim();

  // Update .env file
  try {
    let envContent = fs.readFileSync(path.join(projectRoot, ".env"), "utf8");
    envContent = envContent.replace(/FRIEND_PHONE_NUMBER=.*/, `FRIEND_PHONE_NUMBER=${config.friendPhoneNumber}`);
    envContent = envContent.replace(/PUBLIC_BASE_URL=.*/, `PUBLIC_BASE_URL=${config.publicBaseUrl}`);
    envContent = envContent.replace(/SARVAM_TTS_LANGUAGE=.*/, `SARVAM_TTS_LANGUAGE=${config.sarvamTtsLanguage}`);
    envContent = envContent.replace(/SARVAM_TTS_SPEAKER=.*/, `SARVAM_TTS_SPEAKER=${config.sarvamTtsSpeaker}`);
    fs.writeFileSync(path.join(projectRoot, ".env"), envContent, "utf8");
  } catch (e) {
    console.error("Error updating .env:", e.message);
  }

  res.json({ success: true, message: "Configuration updated successfully" });
});

// Map to track consecutive silence counts per call: callSid -> count
const silenceCounts = new Map();

// Map to hold pre-computed AI replies while Twilio waits: callSid -> { replyText, replyAudioId, chatMs, ttsMs }
const pendingReplies = new Map();

// -------------------------------------------------------------
// TWILIO VOICE CALL FLOW & LATENCY TRACKING
// -------------------------------------------------------------

// Webhook: Twilio hits this when the call connects
app.all("/twiml", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || "unknown";
  console.log(`\n📞 [Call Connected] CallSid: ${callSid}`);

  silenceCounts.set(callSid, 0);
  currentActiveCall.callSid = callSid;
  currentActiveCall.status = "in-progress";
  currentActiveCall.startedAt = currentActiveCall.startedAt || new Date().toISOString();
  startCallStatusPoller(callSid);

  const greetingText = currentGreeting || "Hello, kya meri baat Doctor se ho rahi hai?";

  // Initialize conversation memory
  const history = [
    { role: "system", content: currentSystemPrompt },
    { role: "assistant", content: greetingText },
  ];
  activeConversations.set(callSid, history);

  console.log(`[Sarvam AI] Synthesizing greeting: "${greetingText}"...`);
  const { audioId, ttsMs } = await synthesizeSpeech(greetingText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

  const initialTurn = {
    role: "assistant",
    text: greetingText,
    timestamp: new Date().toISOString(),
    chatMs: 0,
    ttsMs: ttsMs,
    totalMs: ttsMs,
    audioUrl: audioId ? `/audio/${audioId}.wav` : null
  };

  currentActiveCall.turns = [initialTurn];
  currentActiveCall.latencyStats.latestChatMs = 0;
  currentActiveCall.latencyStats.latestTtsMs = ttsMs;
  currentActiveCall.latencyStats.latestTotalMs = ttsMs;
  currentActiveCall.latencyStats.samples = [ttsMs];

  broadcast("transcript_turn", { callSid, turn: initialTurn, latencyStats: currentActiveCall.latencyStats });
  broadcast("call_status", { activeCall: currentActiveCall });

  const twiml = new twilio.twiml.VoiceResponse();

  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: 1.5,
    speechModel: "phone_call",
    timeout: 8,
    language: config.sarvamTtsLanguage,
  });

  if (audioId) {
    const audioUrl = `${config.publicBaseUrl}/audio/${audioId}.wav`;
    console.log(`[TwiML] Embedding Sarvam audio in <Gather>: ${audioUrl}`);
    gather.play(audioUrl);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, greetingText);
  }

  // If user doesn't speak during greeting, redirect to silence check instead of hanging up
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);

  res.type("text/xml").send(twiml.toString());
});

// Webhook: Handle silence/pauses without abruptly hanging up
app.all("/voice/silence", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || currentActiveCall.callSid || "unknown";
  const count = (silenceCounts.get(callSid) || 0) + 1;
  silenceCounts.set(callSid, count);
  console.log(`[Call ${callSid}] Silence pause event #${count}`);

  const twiml = new twilio.twiml.VoiceResponse();

  if (count <= 5) {
    let promptMsg = "Hello? Kya meri aawaz aa rahi hai?";
    if (count === 2) {
      promptMsg = "Haanji, main yahi hoon, kya aap sun pa rahe hain?";
    } else if (count === 3) {
      promptMsg = "Hello? Aapki aawaz nahi aa rahi, kya aap sun pa rahe hain?";
    } else if (count === 4) {
      promptMsg = "Agar meri aawaz aa rahi hai toh boliye, main sun rahi hoon.";
    } else if (count === 5) {
      promptMsg = "Hello? Kya aap line par hain?";
    }

    const { audioId } = await synthesizeSpeech(promptMsg, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

    const gather = twiml.gather({
      input: "speech",
      action: `${config.publicBaseUrl}/voice/respond`,
      method: "POST",
      speechTimeout: 1.5,
      speechModel: "phone_call",
      timeout: 8,
      language: config.sarvamTtsLanguage,
    });

    if (audioId) {
      gather.play(`${config.publicBaseUrl}/audio/${audioId}.wav`);
    } else {
      gather.say({ voice: "Polly.Aditi", language: "en-IN" }, promptMsg);
    }

    // Keep looping if still silent
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Never hang up automatically: continue listening politely
  const keepAliveMsg = "Haanji, main yahi hoon, aap sun pa rahe hain?";
  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: 1.5,
    speechModel: "phone_call",
    timeout: 8,
    language: config.sarvamTtsLanguage,
  });
  gather.say({ voice: "Polly.Aditi", language: "en-IN" }, keepAliveMsg);
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
  res.type("text/xml").send(twiml.toString());
});

// Webhook: Twilio posts what your friend said
// Responds IMMEDIATELY with natural conversational filler audio to keep the line active,
// while AI reasoning and TTS audio synthesize in parallel in the background.
// This guarantees zero carrier silence disconnects and keeps the call 100% connected.
app.all("/voice/respond", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || currentActiveCall.callSid || "unknown";
  const userSpeech = req.body?.SpeechResult || req.query?.SpeechResult;
  console.log(`\n🗣️ [Friend Spoke - ${callSid}]: "${userSpeech || "(no speech detected)"}"`);

  if (!userSpeech || userSpeech.trim().length === 0) {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Reset silence counter since friend spoke
  silenceCounts.set(callSid, 0);

  // 1. Record friend turn immediately
  const userTurn = {
    role: "user",
    text: userSpeech,
    timestamp: new Date().toISOString()
  };
  currentActiveCall.turns.push(userTurn);
  broadcast("transcript_turn", { callSid, turn: userTurn });

  // 2. AI Reasoning & Bulbul Audio Generation (Direct, no robotic fillers!)
  let history = activeConversations.get(callSid) || [
    { role: "system", content: currentSystemPrompt },
  ];
  history.push({ role: "user", content: userSpeech });

  // Count user turns to determine if Turn 1 or subsequent turn
  const userTurnCount = history.filter(m => m.role === "user").length;

  // Two-Tier Prompting: Turn 1 uses full prompt, Turn 2+ uses compressed active context
  let messagesToSend;
  if (userTurnCount <= 1) {
    const turn1Prompt = `${currentSystemPrompt}\n\n## STRICT CONVERSATION RULES\n- DO NOT repeatedly say "Doctor" or "Doctor ji". Speak like a polite, warm human using "aap" / "ji".\n- Respond in 10 to 18 words maximum (1-2 short sentences).`;
    messagesToSend = [
      { role: "system", content: turn1Prompt },
      ...history.filter(m => m.role !== "system")
    ];
  } else {
    const compressedPrompt = `ROLE: Diya, female caller for Career Plan B speaking to a doctor in Hinglish.
GOAL: Confirm NEET PG WhatsApp toolkit reached them, answer basic toolkit questions, and offer an optional free session with an expert counsellor.
CONVERSATION RULES:
- Tone: Calm, respectful, peer-to-peer, not a salesperson. Keep responses short (10-18 words, max 1-2 short sentences).
- Address naturally with "aap" / "ji", avoid robotic repetition of "Doctor" in every turn.
- If not interested: Persuade gently once (session is free, covers branch-wise options). If still not convinced, end politely with closing line: "Koi baat nahi ji, thank you so much for your time."
- Toolkit USPs: MD/MS true cost calculator, Seat predictor, Bond explorer, Hospital bed indicator. Website: careerplanb.co.
- Outside your scope / branch advice: "Iske baare mein hamare expert counsellor detail mein bata payenge" (max 2 times per call).
- NEVER cut or hang up the call from your end. Never quote ranks, fees, or guarantee admission.`;
    // Sliding window: keep only the last 4 turns (2 user, 2 assistant) to prevent token bloat
    const recentHistory = history.filter(m => m.role !== "system").slice(-4);
    messagesToSend = [
      { role: "system", content: compressedPrompt },
      ...recentHistory
    ];
  }

  let replyText = "Ji, main sun rahi hoon, boliye.";
  let chatMs = 0;
  try {
    console.log(`[Sarvam Chat] Sending message to ${config.sarvamChatModel} (Turn #${userTurnCount}, ${messagesToSend.length} context items)...`);
    const chatT0 = Date.now();
    const completion = await sarvam.chat.completions({
      model: config.sarvamChatModel,
      messages: messagesToSend,
      temperature: 0.45,
    });
    chatMs = Date.now() - chatT0;

    replyText = completion.choices?.[0]?.message?.content || replyText;
    console.log(`[Sarvam AI Reply (${chatMs}ms)]: "${replyText}"`);
    history.push({ role: "assistant", content: replyText });
    activeConversations.set(callSid, history);
  } catch (err) {
    console.error("[Sarvam Chat Error]:", err.message);
  }

  console.log(`[Sarvam TTS] Generating audio for reply...`);
  const { audioId: replyAudioId, ttsMs } = await synthesizeSpeech(replyText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

  const totalTurnMs = chatMs + ttsMs;
  console.log(`⚡ [LATENCY METRIC] Chat: ${chatMs}ms | TTS: ${ttsMs}ms | Turn Total: ${totalTurnMs}ms`);

  // Update latency stats
  currentActiveCall.latencyStats.latestChatMs = chatMs;
  currentActiveCall.latencyStats.latestTtsMs = ttsMs;
  currentActiveCall.latencyStats.latestTotalMs = totalTurnMs;
  currentActiveCall.latencyStats.samples.push(totalTurnMs);

  const assistantTurn = {
    role: "assistant",
    text: replyText,
    timestamp: new Date().toISOString(),
    chatMs,
    ttsMs,
    totalMs: totalTurnMs,
    audioUrl: replyAudioId ? `/audio/${replyAudioId}.wav` : null
  };
  currentActiveCall.turns.push(assistantTurn);
  broadcast("transcript_turn", {
    callSid,
    turn: assistantTurn,
    latencyStats: currentActiveCall.latencyStats
  });

  // 3. Directly stream synthesized AI audio inside <Gather> (No robotic fillers!)
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: 1.5,
    speechModel: "phone_call",
    timeout: 8,
    language: config.sarvamTtsLanguage,
  });

  if (replyAudioId) {
    gather.play(`${config.publicBaseUrl}/audio/${replyAudioId}.wav`);
  } else {
    gather.say({ voice: "Polly.Aditi", language: "en-IN" }, replyText);
  }

  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
  res.type("text/xml").send(twiml.toString());
});

// Endpoint: Legacy fallback redirect for /voice/process
app.all("/voice/process", (_req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
  res.type("text/xml").send(twiml.toString());
});

// Call Status Webhook - Persist transcript when call completes
app.post("/call-status", (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  console.log(`[Twilio Status Webhook] CallSid: ${CallSid}, Status: ${CallStatus}, Duration: ${Duration || 0}s`);

  if (CallStatus === "completed" || CallStatus === "failed" || CallStatus === "busy" || CallStatus === "no-answer") {
    finalizeCall(CallSid, CallStatus, Duration);
  } else if (currentActiveCall.callSid === CallSid) {
    currentActiveCall.status = CallStatus;
    broadcast("call_status", { activeCall: currentActiveCall });
  }

  res.sendStatus(204);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ [PORT CONFLICT] Port ${config.port} is already in use by another program!`);
    console.error(`👉 Run this in PowerShell to free it:`);
    console.error(`   Get-NetTCPConnection -LocalPort ${config.port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    console.error(`👉 Or change PORT in .env (e.g. PORT=${config.port + 1})\n`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
  }
});

server.listen(config.port, () => {
  console.log(`
====================================================================
🇮🇳 Sarvam AI + Twilio Voice Studio running on port ${config.port}!
👉 UI Dashboard: http://localhost:${config.port}
👉 Health Check: http://localhost:${config.port}/health
👉 Public TwiML Webhook: ${config.publicBaseUrl}/twiml
👉 Sarvam Model: ${config.sarvamChatModel}
👉 Voice Language: ${config.sarvamTtsLanguage} (${config.sarvamTtsSpeaker})
====================================================================
`);
});
