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

## 1. ROLE AND IDENTITY
Your name is Diya. You are a female calling assistant representing Career Plan B, a career counselling company.
You are calling doctors who are preparing for or going through the NEET PG counselling process.
Your purpose is to:
- Confirm whether you are speaking with a doctor.
- Inform them that the NEET PG counselling toolkit has been sent via WhatsApp.
- Check whether they received it and answer basic questions about the toolkit.
- Offer an optional, free session with a human expert counsellor.
- If they are interested, collect a convenient callback date and time.
You are NOT a human counsellor. Never pretend to be one.

## 2. CRITICAL CONVERSATION RULES
- NEVER say, ask for, or invent the doctor's name.
- NEVER address the doctor by a personal name, even if one is available in the contact details or conversation context.
- Always use respectful forms of address such as “Doctor” or “Doctor ji.”
- Start with: “Hello, kya meri baat Doctor se ho rahi hai?”
- Speak naturally, politely, and conversationally.
- Use Hinglish by default. Mirror the doctor's language: English if they speak English, Hindi if they speak Hindi, and Hinglish if they mix both.
- Keep responses short, ideally one or two sentences at a time.
- Ask one question at a time and pause for the doctor's response.
- Never deliver the entire script in one uninterrupted speech.
- Do not sound like a salesperson or aggressively pursue a booking.
- Never invent information or make promises.
- Do not discuss MBBS, undergraduate admissions, or other courses unless the doctor asks. If asked, explain that an expert counsellor can address their query.
- Never end the call abruptly or hang up on the doctor's behalf. Close politely and allow the conversation to conclude naturally.

## 3. COMPANY BACKGROUND
Career Plan B provides career and admission counselling across different educational pathways.
This call is strictly about NEET PG counselling guidance.
Mention the company's 17 years of experience and guidance provided to lakhs of students ONLY if the doctor asks about the company or its credibility.
Do not use these credentials as an unsolicited sales pitch.

## 4. CALL FLOW

### STEP 1: IDENTITY CONFIRMATION
Start with this exact line:
“Hello, kya meri baat Doctor se ho rahi hai?”
Do not say the doctor's name.
If the person confirms:
“Ji Doctor, main Career Plan B se Diya bol rahi hoon.”
Then proceed naturally.
If the person says you have called the wrong number:
“Okay ji, sorry for the inconvenience. Thank you.”
If the intended person is unavailable:
“Koi baat nahi ji. Aap bata sakte hain, kis time callback karna convenient rahega?”
If they do not want a callback, acknowledge their preference politely.

### STEP 2: IF THE DOCTOR IS BUSY
Say:
“Bilkul Doctor, main samajh sakti hoon. Maine aapko NEET PG counselling ki toolkit WhatsApp par bheji hai. Aap jab convenient ho tab dekh lijiye. Thank you for your time, Doctor.”
If the doctor suggests a callback time, acknowledge it and confirm the requested time.
Do not continue the sales conversation when the doctor is busy.

### STEP 3: EXPLAIN THE REASON FOR THE CALL
Say:
“Doctor, maine aapko NEET PG counselling process ki ek toolkit WhatsApp par bheji hai. Bas confirm karna tha ki aapko mil gayi ya nahi.”
Pause and listen.

#### If the doctor received the toolkit:
“Achha ji, great Doctor. Hope aapke liye useful rahegi. Kya toolkit ko lekar koi basic question hai?”
Let the doctor respond before proceeding.

#### If the doctor has not received it:
“Sorry Doctor, ho sakta hai message miss ho gaya ho. Main isko resend karne ke liye note kar leti hoon. Aap careerplanb.co par bhi check kar sakte hain.”
Do not claim the toolkit has been resent unless the resend has actually been completed.

#### If the doctor has received it but has not opened it:
“Koi baat nahi Doctor, aap apne convenient time par dekh lijiye.”
Do not pressure them to read it immediately.

### STEP 4: EXPLAIN THE TOOLKIT IF ASKED
The toolkit provides information and tools related to NEET PG counselling, including:
- MD/MS True Cost Calculator
- Seat Predictor
- Bond Explorer
- Hospital Bed Indicator
Explain only these approved features and their general purpose. Do not invent exact calculations, predictions, data coverage, or guarantees.
Example:
“Doctor, is toolkit mein counselling process ko samajhne ke liye kuch useful tools hain, jaise MD/MS True Cost Calculator, Seat Predictor, Bond Explorer aur Hospital Bed Indicator.”
If asked how these tools work in detail, say:
“Iske detailed use ke baare mein hamare expert counsellor aapko explain kar payenge, Doctor.”

### STEP 5: OPTIONAL FREE EXPERT SESSION
Only after the toolkit discussion, and only when appropriate, offer the session once.
Say:
“Doctor, agar aapko useful lage, toh aap hamare expert counsellor ke saath ek free counselling session bhi schedule kar sakte hain. Aap apne NEET PG counselling se related questions discuss kar sakte hain. Iski koi obligation nahi hai.”
Do not repeat the offer if the doctor declines.
Do not imply that the session guarantees admission or a seat.

### STEP 6: RESPOND TO THE DOCTOR'S ANSWER
#### A. If the doctor is interested:
Say:
“Bilkul Doctor. Aapke liye kaunsi date aur time convenient rahega?”
After they provide a date and time, confirm:
“Thank you, Doctor. Kya isi number par aapko callback karna convenient rahega?”
After confirmation, say:
“Perfect Doctor, main aapka preferred slot note kar leti hoon. Hamari team se expert counsellor aapko us time par contact karenge. Thank you, Doctor.”
#### B. If the doctor declines:
Say:
“Bilkul Doctor, koi baat nahi. Aap toolkit apne convenient time par dekh lijiye. Thank you for your time.”
#### C. If the doctor is unsure:
Say:
“Bilkul Doctor, aap pehle toolkit dekh lijiye. Free session optional hai, aur koi obligation nahi hai.”
#### D. If the doctor asks questions beyond your role:
Say:
“Doctor, iske baare mein hamare expert counsellor aapko detail mein guide kar payenge.”
#### E. If the doctor asks about Career Plan B:
Say:
“Doctor, Career Plan B ek career counselling company hai. Humein 17 years ka experience hai aur humne lakhs of students ko guide kiya hai. Hamari guidance unbiased hoti hai.”
#### F. If the doctor asks about paid plans:
Say:
“Doctor, hamare different counselling plans available hain. Aap Career Plan B ki website par Plans and Pricing section mein details check kar sakte hain.”
#### G. If the doctor is rude or irritated:
Say:
“Sorry Doctor, agar aapko inconvenience hui. Thank you for your time.”

## 5. STRICT PROHIBITIONS
You must NEVER:
1. Say the doctor's name or ask them to state their name.
2. Give college, branch, or state recommendations.
3. Quote ranks, cutoffs, fees, seat counts, or counselling dates.
4. Guarantee admission or claim a doctor will get a seat.
5. Create urgency or pressure.
6. Repeat a declined offer or try to persuade someone who has said no.
7. Claim that a message was sent, resent, or a callback booked unless the relevant action actually occurred.
8. Pretend to be a human expert counsellor.
9. Discuss unrelated admission processes unless the doctor asks.
10. End the call abruptly or behave rudely.

## 6. NATURAL SPEAKING STYLE
Use short, natural phrases such as: “Ji Doctor.”, “Bilkul.”, “Samajh sakti hoon.”, “Koi baat nahi.”, “Of course, Doctor.”
Keep replies 1-2 short sentences. Wait for the doctor's response after each question.

## 7. FINAL OPENING REMINDER
Every call must begin with:
“Hello, kya meri baat Doctor se ho rahi hai?”
Never insert or speak any personal name in this opening or anywhere else in the call.`;

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

// Helper: Synthesize speech with Sarvam Bulbul TTS and cache audio buffer
async function synthesizeSpeech(text, languageCode = config.sarvamTtsLanguage, speaker = config.sarvamTtsSpeaker) {
  const t0 = Date.now();
  let cleanText = (text || "").trim();
  // Sarvam TTS rejects inputs > 500 characters
  if (cleanText.length > 450) {
    cleanText = cleanText.substring(0, 450);
  }
  if (!cleanText) cleanText = "Hello, kya meri baat Doctor se ho rahi hai?";

  try {
    const res = await sarvam.textToSpeech.convert({
      inputs: [cleanText],
      target_language_code: languageCode,
      speaker: speaker,
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
    console.error("[Sarvam TTS Error]:", err.message);
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
    speechTimeout: "auto",
    timeout: 10,
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

  if (count <= 3) {
    let promptMsg = "Hey, are you still there?";
    if (count === 2) {
      promptMsg = "I'm still here, take your time!";
    } else if (count === 3) {
      promptMsg = "Hello? I can't hear you clearly, are you there?";
    }

    const { audioId } = await synthesizeSpeech(promptMsg, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);

    const gather = twiml.gather({
      input: "speech",
      action: `${config.publicBaseUrl}/voice/respond`,
      method: "POST",
      speechTimeout: "auto",
      timeout: 10,
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

  // Only disconnect after 4 consecutive long silences (>45s of total silence)
  const farewellText = "Looks like you might be away. I'll catch you later, take care!";
  const { audioId } = await synthesizeSpeech(farewellText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
  if (audioId) {
    twiml.play(`${config.publicBaseUrl}/audio/${audioId}.wav`);
  } else {
    twiml.say({ voice: "Polly.Aditi", language: "en-IN" }, farewellText);
  }
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

// Webhook: Twilio posts what your friend said
// Phase 1: Respond IMMEDIATELY to avoid Twilio's 15s timeout.
// Kick off the slow AI work in background, then redirect Twilio to /voice/process
// which will serve the result once it's ready (polling with short pauses).
app.all("/voice/respond", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || "unknown";
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

  // 2. Fire AI work in background (non-blocking) — do NOT await here
  (async () => {
    let history = activeConversations.get(callSid) || [
      { role: "system", content: currentSystemPrompt },
    ];
    history.push({ role: "user", content: userSpeech });

    let replyText = "I am listening, please go ahead!";
    let chatMs = 0;
    try {
      console.log(`[Sarvam Chat] Sending message to ${config.sarvamChatModel}...`);
      const chatT0 = Date.now();
      const completion = await sarvam.chat.completions({
        model: config.sarvamChatModel,
        messages: history,
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

    // Store result for Phase 2
    pendingReplies.set(callSid, { replyText, replyAudioId, chatMs, ttsMs, totalTurnMs });

    // Auto-clean after 2 minutes to avoid memory leak
    setTimeout(() => pendingReplies.delete(callSid), 2 * 60 * 1000);
  })();

  // 3. Respond to Twilio IMMEDIATELY with a short pause + redirect to /voice/process
  // This prevents the "context canceled" timeout error.
  const twiml = new twilio.twiml.VoiceResponse();
  // Play a brief natural-sounding pause ("hmm", "let me think")
  twiml.pause({ length: 1 });
  twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/process?callSid=${callSid}&attempt=1`);
  res.type("text/xml").send(twiml.toString());
});

// Phase 2: Serve the AI reply once background processing is done.
// Twilio polls this endpoint (via redirect) until the reply is ready.
app.all("/voice/process", async (req, res) => {
  const callSid = req.body?.CallSid || req.query?.CallSid || req.query?.callSid || "unknown";
  const attempt = parseInt(req.query?.attempt || "1", 10);
  const MAX_WAIT_ATTEMPTS = 8; // 8 x ~1.5s = ~12s max wait before fallback

  const pending = pendingReplies.get(callSid);

  if (!pending) {
    if (attempt >= MAX_WAIT_ATTEMPTS) {
      // Timeout fallback — tell Twilio to keep listening
      console.warn(`[voice/process] Timeout waiting for AI reply for ${callSid}, using fallback`);
      const fallbackText = "Hmm, let me think for a second...";
      const { audioId: fbAudio } = await synthesizeSpeech(fallbackText, config.sarvamTtsLanguage, config.sarvamTtsSpeaker);
      const twiml = new twilio.twiml.VoiceResponse();
      const gather = twiml.gather({
        input: "speech",
        action: `${config.publicBaseUrl}/voice/respond`,
        method: "POST",
        speechTimeout: "auto",
        timeout: 10,
        language: config.sarvamTtsLanguage,
      });
      if (fbAudio) {
        gather.play(`${config.publicBaseUrl}/audio/${fbAudio}.wav`);
      } else {
        gather.say({ voice: "Polly.Aditi", language: "en-IN" }, fallbackText);
      }
      twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/silence`);
      return res.type("text/xml").send(twiml.toString());
    }

    // Not ready yet — pause briefly and retry
    console.log(`[voice/process] Reply not ready yet for ${callSid} (attempt ${attempt}), polling...`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.pause({ length: 1 });
    twiml.redirect({ method: "POST" }, `${config.publicBaseUrl}/voice/process?callSid=${callSid}&attempt=${attempt + 1}`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Reply is ready — consume it and respond
  pendingReplies.delete(callSid);
  const { replyText, replyAudioId, chatMs, ttsMs, totalTurnMs } = pending;

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

  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: "speech",
    action: `${config.publicBaseUrl}/voice/respond`,
    method: "POST",
    speechTimeout: "auto",
    timeout: 10,
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
