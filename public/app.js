// ===================================================================
// SARVAM VOICE STUDIO - CLIENT APPLICATION LOGIC
// ===================================================================

const state = {
  activeCall: null,
  callTimerInterval: null,
  callSeconds: 0,
  ws: null,
  transcripts: [],
  selectedHistoryId: null,
};

// Preset prompts
const PROMPT_PRESETS = {
  doctor: `# AI CALLING AGENT PROMPT — DIYA | CAREER PLAN B

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
Confirm the toolkit reached them and book a free counsellor session slot if they want one, or conclude courteously if they don't.`,

  casual: `You are a warm, casual, and friendly AI calling a friend on the phone.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.`,

  dinner: `You are a friendly AI calling on behalf of a friend to make plans for dinner or hanging out this weekend.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Ask what their schedule looks like, what cuisine they prefer (Italian, Indian, Chinese), and keep it fun, casual, and concise.`,

  birthday: `You are calling to wish the friend an enthusiastic, warm, and happy birthday!
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Sing a quick birthday wish line, ask how they are celebrating today, and wish them a fantastic year ahead in a joyful Indian tone.`,

  assistant: `You are a polite personal voice assistant calling to quickly check availability for an upcoming sync meeting.
Rules for conversation:
1. Speak in a natural, casual, and conversational tone with short replies (1-2 sentences max).
2. Never recite long lists or sound like a corporate robot.
3. If the friend speaks in Hindi, Hinglish, Punjabi, or English, reply naturally in the same language.
4. Keep the conversation engaging by asking a simple question back.
Be courteous, professional, concise, and confirm whether they have 10 minutes free later today.`,

  custom: ``
};

// DOM Elements
const wsStatusPill = document.getElementById('wsStatusPill');
const wsStatusText = document.getElementById('wsStatusText');
const callStatusBadge = document.getElementById('callStatusBadge');
const liveTurnIndicator = document.getElementById('liveTurnIndicator');
const liveTurnText = document.getElementById('liveTurnText');
const dialerForm = document.getElementById('dialerForm');
const startCallBtn = document.getElementById('startCallBtn');
const hangupCallBtn = document.getElementById('hangupCallBtn');
const inputFriendNumber = document.getElementById('inputFriendNumber');
const selectLanguage = document.getElementById('selectLanguage');
const selectSpeaker = document.getElementById('selectSpeaker');
const selectPromptPreset = document.getElementById('selectPromptPreset');
const inputGreeting = document.getElementById('inputGreeting');
const customPromptGroup = document.getElementById('customPromptGroup');
const inputCustomPrompt = document.getElementById('inputCustomPrompt');
const metaCallSid = document.getElementById('metaCallSid');
const metaTwilioNumber = document.getElementById('metaTwilioNumber');
const callDurationTimer = document.getElementById('callDurationTimer');
const transcriptContainer = document.getElementById('transcriptContainer');
const emptyTranscriptState = document.getElementById('emptyTranscriptState');
const audioWaveBar = document.getElementById('audioWaveBar');
const waveSpeakerLabel = document.getElementById('waveSpeakerLabel');

// Latency DOM Elements
const gaugePath = document.getElementById('gaugePath');
const currentLatencyNumber = document.getElementById('currentLatencyNumber');
const latencyRatingText = document.getElementById('latencyRatingText');
const breakdownChatMs = document.getElementById('breakdownChatMs');
const breakdownTtsMs = document.getElementById('breakdownTtsMs');
const breakdownTotalMs = document.getElementById('breakdownTotalMs');
const barChat = document.getElementById('barChat');
const barTts = document.getElementById('barTts');
const avgLatencyStat = document.getElementById('avgLatencyStat');
const turnCountStat = document.getElementById('turnCountStat');
const subsecondBadge = document.getElementById('subsecondBadge');

// History & Tabs DOM
const tabStudioBtn = document.getElementById('tabStudioBtn');
const tabHistoryBtn = document.getElementById('tabHistoryBtn');
const tabAnalyticsBtn = document.getElementById('tabAnalyticsBtn');
const studioView = document.getElementById('studioView');
const historyView = document.getElementById('historyView');
const analyticsView = document.getElementById('analyticsView');
const historyCallsList = document.getElementById('historyCallsList');
const detailContent = document.getElementById('detailContent');
const detailCallTitle = document.getElementById('detailCallTitle');
const detailCallSubtitle = document.getElementById('detailCallSubtitle');
const detailActions = document.getElementById('detailActions');
const transcriptCountBadge = document.getElementById('transcriptCountBadge');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
const deleteTranscriptBtn = document.getElementById('deleteTranscriptBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const exportChatBtn = document.getElementById('exportChatBtn');

// Settings Modal
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const settingsForm = document.getElementById('settingsForm');
const settingPublicUrl = document.getElementById('settingPublicUrl');
const settingFriendNumber = document.getElementById('settingFriendNumber');
const settingTwilioFrom = document.getElementById('settingTwilioFrom');
const settingSystemPrompt = document.getElementById('settingSystemPrompt');

// ===================================================================
// WEBSOCKET REAL-TIME SYNC
// ===================================================================

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/dashboard-ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    wsStatusPill.className = 'status-pill online';
    wsStatusText.textContent = 'Live Socket Connected';
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (e) {
      console.error('WS Parse Error:', e);
    }
  };

  state.ws.onclose = () => {
    wsStatusPill.className = 'status-pill';
    wsStatusText.textContent = 'Reconnecting...';
    setTimeout(initWebSocket, 2000);
  };

  state.ws.onerror = () => {
    state.ws.close();
  };
}

function handleServerEvent(event) {
  switch (event.type) {
    case 'init':
      if (event.config) {
        metaTwilioNumber.textContent = event.config.twilioPhoneNumber || '+17372508034';
        if (event.config.friendPhoneNumber) {
          inputFriendNumber.value = event.config.friendPhoneNumber;
        }
        if (event.config.sarvamTtsLanguage) {
          selectLanguage.value = event.config.sarvamTtsLanguage;
        }
        if (event.config.sarvamTtsSpeaker) {
          selectSpeaker.value = event.config.sarvamTtsSpeaker;
        }
        if (event.config.greeting && inputGreeting) {
          inputGreeting.value = event.config.greeting;
        }
      }
      if (event.activeCall && event.activeCall.status !== 'idle' && event.activeCall.status !== 'completed') {
        updateCallState(event.activeCall);
      }
      break;

    case 'call_status':
      if (event.activeCall) {
        updateCallState(event.activeCall);
      }
      break;

    case 'transcript_turn':
      renderTurn(event.turn);
      if (event.latencyStats) {
        updateLatencyMeter(event.latencyStats);
      }
      break;

    case 'transcript_saved':
      fetchTranscripts();
      break;
  }
}

// ===================================================================
// CALL LIFECYCLE & STATE MANAGEMENT
// ===================================================================

function updateCallState(call) {
  state.activeCall = call;
  const status = (call.status || 'idle').toLowerCase();

  callStatusBadge.textContent = status.toUpperCase();
  callStatusBadge.className = `badge-status ${status}`;

  if (call.callSid) {
    metaCallSid.textContent = `${call.callSid.slice(0, 8)}...${call.callSid.slice(-4)}`;
  }

  if (status === 'dialing' || status === 'ringing' || status === 'in-progress') {
    startCallBtn.style.display = 'none';
    hangupCallBtn.style.display = 'flex';
    liveTurnIndicator.classList.add('active');

    if (status === 'ringing') {
      liveTurnText.textContent = 'Ringing destination phone...';
      audioWaveBar.classList.remove('speaking');
    } else if (status === 'in-progress') {
      liveTurnText.textContent = 'Call active • Live conversation';
      startCallTimer();
    }
  } else {
    startCallBtn.style.display = 'flex';
    hangupCallBtn.style.display = 'none';
    liveTurnIndicator.classList.remove('active');
    liveTurnText.textContent = status === 'completed' ? 'Call finished' : 'Ready for call';
    audioWaveBar.classList.remove('speaking');
    stopCallTimer();
  }
}

function startCallTimer() {
  if (state.callTimerInterval) return;
  state.callSeconds = 0;
  state.callTimerInterval = setInterval(() => {
    state.callSeconds++;
    const mins = String(Math.floor(state.callSeconds / 60)).padStart(2, '0');
    const secs = String(state.callSeconds % 60).padStart(2, '0');
    callDurationTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  if (state.callTimerInterval) {
    clearInterval(state.callTimerInterval);
    state.callTimerInterval = null;
  }
}

// ===================================================================
// REAL-TIME TRANSCRIPT RENDERING
// ===================================================================

// SVG Icons for clean UI
const SVG_ICONS = {
  assistant: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>`,
  user: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  play: `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  speaker: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`
};

function renderTurn(turn) {
  if (emptyTranscriptState) {
    emptyTranscriptState.style.display = 'none';
  }

  const isAssistant = turn.role === 'assistant';
  const turnEl = document.createElement('div');
  turnEl.className = `chat-turn ${turn.role}`;

  const timeStr = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  let footerHtml = `<span class="turn-time">${timeStr}</span>`;
  if (isAssistant && turn.totalMs > 0) {
    footerHtml += `<span class="latency-pill font-mono">${turn.totalMs}ms</span>`;
  }
  if (isAssistant && turn.audioUrl) {
    footerHtml += `
      <button class="btn-play-audio" onclick="playAudio('${turn.audioUrl}', this)">
        ${SVG_ICONS.play} <span>Replay Audio</span>
      </button>
    `;
  }

  turnEl.innerHTML = `
    <div class="turn-avatar">${isAssistant ? SVG_ICONS.assistant : SVG_ICONS.user}</div>
    <div class="turn-bubble">
      <div class="turn-text">${escapeHtml(turn.text)}</div>
      <div class="turn-footer">${footerHtml}</div>
    </div>
  `;

  transcriptContainer.appendChild(turnEl);
  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

  // Animate wave equalizer
  audioWaveBar.classList.add('speaking');
  waveSpeakerLabel.textContent = isAssistant ? 'Voice AI Speaking' : 'Caller Speaking';
  setTimeout(() => {
    audioWaveBar.classList.remove('speaking');
    waveSpeakerLabel.textContent = 'Voice Activity';
  }, 3500);
}

window.playAudio = function (url, btn) {
  const audio = new Audio(url);
  const oldHtml = btn.innerHTML;
  btn.innerHTML = `${SVG_ICONS.speaker} <span>Playing...</span>`;
  audio.play().catch(e => console.error('Audio play error:', e));
  audio.onended = () => {
    btn.innerHTML = oldHtml;
  };
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===================================================================
// LATENCY TELEMETRY & WATERFALL METER
// ===================================================================

function updateLatencyMeter(stats) {
  const total = stats.latestTotalMs || 0;
  const chat = stats.latestChatMs || 0;
  const tts = stats.latestTtsMs || 0;

  // Numbers
  currentLatencyNumber.textContent = total;
  breakdownChatMs.textContent = `${chat} ms`;
  breakdownTtsMs.textContent = `${tts} ms`;
  breakdownTotalMs.textContent = `${total} ms`;

  // Waterfall bars (% relative to max 1500ms)
  const maxScale = 1500;
  barChat.style.width = `${Math.min(100, (chat / maxScale) * 100)}%`;
  barTts.style.width = `${Math.min(100, (tts / maxScale) * 100)}%`;

  // Speedometer Gauge Arc (Stroke Dasharray: 235.6)
  const totalCircumference = 235.6;
  const percentage = Math.min(1, Math.max(0, total / 2000));
  const offset = totalCircumference * (1 - percentage);
  gaugePath.style.strokeDashoffset = offset;

  // Color rating
  if (total <= 800) {
    gaugePath.style.stroke = '#10b981'; // Emerald
    latencyRatingText.textContent = 'Optimal Latency (Sub-Second)';
    latencyRatingText.style.color = '#34d399';
    subsecondBadge.textContent = 'Target Met: <800ms';
    subsecondBadge.style.color = '#34d399';
  } else if (total <= 1200) {
    gaugePath.style.stroke = '#38bdf8'; // Sky
    latencyRatingText.textContent = 'Nominal Telephonic Speed (~1s)';
    latencyRatingText.style.color = '#38bdf8';
    subsecondBadge.textContent = 'Nominal (~1s)';
    subsecondBadge.style.color = '#38bdf8';
  } else {
    gaugePath.style.stroke = '#f59e0b'; // Amber
    latencyRatingText.textContent = 'Standard Turn Response';
    latencyRatingText.style.color = '#fbbf24';
    subsecondBadge.textContent = 'High (>1.2s)';
    subsecondBadge.style.color = '#fbbf24';
  }

  // Session Averages
  if (stats.samples && stats.samples.length > 0) {
    const avg = Math.round(stats.samples.reduce((a, b) => a + b, 0) / stats.samples.length);
    avgLatencyStat.textContent = `${avg} ms`;
    turnCountStat.textContent = stats.samples.length;
  }
}

// ===================================================================
// HISTORY & TRANSCRIPT VIEWER
// ===================================================================

async function fetchTranscripts() {
  try {
    const res = await fetch('/api/transcripts');
    const data = await res.json();
    state.transcripts = data.transcripts || [];
    transcriptCountBadge.textContent = state.transcripts.length;
    renderHistoryList();
    renderAnalytics(state.transcripts);
  } catch (err) {
    console.error('Error fetching transcripts:', err);
  }
}

function renderHistoryList() {
  historyCallsList.innerHTML = '';
  if (state.transcripts.length === 0) {
    historyCallsList.innerHTML = `
      <div class="empty-state" style="padding: 30px 10px;">
        <p>No call transcripts saved yet. Dial a call to record history.</p>
      </div>
    `;
    return;
  }

  state.transcripts.forEach((call, index) => {
    const item = document.createElement('div');
    item.className = `history-item ${state.selectedHistoryId === call.id ? 'active' : ''}`;
    item.onclick = () => selectHistoryCall(call.id);

    const dateStr = new Date(call.startedAt).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const mins = Math.floor(call.durationSec / 60);
    const secs = call.durationSec % 60;
    const durStr = `${mins}m ${secs}s`;

    item.innerHTML = `
      <div class="history-item-header">
        <span class="history-phone">${escapeHtml(call.friendNumber)}</span>
        <span class="history-duration">${durStr}</span>
      </div>
      <div class="history-meta">
        <span>${dateStr}</span>
        <span class="font-mono" style="color: var(--accent-success);">${call.avgLatencyMs || 700}ms avg</span>
      </div>
    `;

    historyCallsList.appendChild(item);
  });
}

function selectHistoryCall(id) {
  state.selectedHistoryId = id;
  renderHistoryList();

  const call = state.transcripts.find(t => t.id === id);
  if (!call) return;

  detailCallTitle.textContent = `Call: ${call.friendNumber}`;
  const dateStr = new Date(call.startedAt).toLocaleString();
  detailCallSubtitle.textContent = `${dateStr} • Duration: ${call.durationSec}s • Avg Latency: ${call.avgLatencyMs}ms`;
  detailActions.style.display = 'flex';

  detailContent.innerHTML = '';
  const turnsWrap = document.createElement('div');
  turnsWrap.className = 'transcript-scroll-area';

  call.turns.forEach(turn => {
    const isAssistant = turn.role === 'assistant';
    const turnEl = document.createElement('div');
    turnEl.className = `chat-turn ${turn.role}`;

    const timeStr = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    let footer = `<span class="turn-time">${timeStr}</span>`;
    if (isAssistant && turn.totalMs > 0) {
      footer += `<span class="latency-pill font-mono">${turn.totalMs}ms</span>`;
    }
    if (isAssistant && turn.audioUrl) {
      footer += `
        <button class="btn-play-audio" onclick="playAudio('${turn.audioUrl}', this)">
          ${SVG_ICONS.play} <span>Replay Audio</span>
        </button>
      `;
    }

    turnEl.innerHTML = `
      <div class="turn-avatar">${isAssistant ? SVG_ICONS.assistant : SVG_ICONS.user}</div>
      <div class="turn-bubble">
        <div class="turn-text">${escapeHtml(turn.text)}</div>
        <div class="turn-footer">${footer}</div>
      </div>
    `;
    turnsWrap.appendChild(turnEl);
  });

  detailContent.appendChild(turnsWrap);
}

function renderAnalytics(transcripts) {
  if (!transcripts || transcripts.length === 0) return;

  let allLatencies = [];
  let allChat = [];
  let allTts = [];

  transcripts.forEach(c => {
    c.turns.forEach(t => {
      if (t.role === 'assistant') {
        if (t.totalMs) allLatencies.push(t.totalMs);
        if (t.chatMs) allChat.push(t.chatMs);
        if (t.ttsMs) allTts.push(t.ttsMs);
      }
    });
  });

  if (allLatencies.length > 0) {
    const min = Math.min(...allLatencies);
    document.getElementById('benchFastestTurn').textContent = `${min} ms`;
  }
  if (allChat.length > 0) {
    const avgChat = Math.round(allChat.reduce((a, b) => a + b, 0) / allChat.length);
    document.getElementById('benchAvgChat').textContent = `${avgChat} ms`;
  }
  if (allTts.length > 0) {
    const avgTts = Math.round(allTts.reduce((a, b) => a + b, 0) / allTts.length);
    document.getElementById('benchAvgTts').textContent = `${avgTts} ms`;
  }
}

// ===================================================================
// EVENT LISTENERS & ACTIONS
// ===================================================================

// Dial Outbound Call
dialerForm.onsubmit = async (e) => {
  e.preventDefault();
  const friendNumber = inputFriendNumber.value.trim();
  const language = selectLanguage.value;
  const speaker = selectSpeaker.value;
  const presetKey = selectPromptPreset.value;
  const customPrompt = presetKey === 'custom' ? inputCustomPrompt.value : PROMPT_PRESETS[presetKey];

  startCallBtn.disabled = true;
  startCallBtn.innerHTML = `
    <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <span class="btn-text">Dialing...</span>
  `;

  try {
    const res = await fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        friendNumber,
        language,
        speaker,
        greeting: inputGreeting ? inputGreeting.value.trim() : "Hello, kya meri baat Doctor se ho rahi hai?",
        systemPrompt: customPrompt
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(`Dial failed: ${data.error || 'Server error'}`);
    }
  } catch (err) {
    alert(`Dial error: ${err.message}`);
  } finally {
    startCallBtn.disabled = false;
    startCallBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
      <span class="btn-text">Initiate Call</span>
    `;
  }
};

// Hang up
hangupCallBtn.onclick = async () => {
  hangupCallBtn.disabled = true;
  hangupCallBtn.innerHTML = `
    <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <span class="btn-text">Disconnecting...</span>
  `;
  try {
    await fetch('/api/hangup', { method: 'POST' });
  } catch (err) {
    console.error('Hangup error:', err);
  } finally {
    hangupCallBtn.disabled = false;
    hangupCallBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
        <line x1="22" x2="2" y1="2" y2="22"></line>
      </svg>
      <span class="btn-text">Disconnect Call</span>
    `;
  }
};

// Prompt Presets selector
selectPromptPreset.onchange = () => {
  if (selectPromptPreset.value === 'custom') {
    customPromptGroup.style.display = 'block';
  } else {
    customPromptGroup.style.display = 'none';
  }
};

// Navigation Tabs
[tabStudioBtn, tabHistoryBtn, tabAnalyticsBtn].forEach(btn => {
  btn.onclick = () => {
    [tabStudioBtn, tabHistoryBtn, tabAnalyticsBtn].forEach(b => b.classList.remove('active'));
    [studioView, historyView, analyticsView].forEach(v => v.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');

    if (targetId === 'historyView') {
      fetchTranscripts();
    }
  };
});

// Clear Chat View
clearChatBtn.onclick = () => {
  transcriptContainer.innerHTML = '';
  transcriptContainer.appendChild(emptyTranscriptState);
  emptyTranscriptState.style.display = 'block';
};

// Export TXT
exportChatBtn.onclick = () => {
  const turns = transcriptContainer.querySelectorAll('.chat-turn');
  if (turns.length === 0) {
    alert('No messages in transcript to export.');
    return;
  }
  let txt = '=== SARVAM VOICE CALL TRANSCRIPT ===\n\n';
  turns.forEach(t => {
    const isUser = t.classList.contains('user');
    const text = t.querySelector('.turn-text')?.textContent || '';
    const time = t.querySelector('.turn-time')?.textContent || '';
    txt += `[${time}] ${isUser ? 'Friend' : 'Sarvam AI'}: ${text}\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sarvam-call-transcript-${Date.now()}.txt`;
  a.click();
};

// Export Selected Call JSON
downloadTranscriptBtn.onclick = () => {
  const call = state.transcripts.find(t => t.id === state.selectedHistoryId);
  if (!call) return;
  const blob = new Blob([JSON.stringify(call, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sarvam-transcript-${call.id}.json`;
  a.click();
};

// Delete Selected Call
deleteTranscriptBtn.onclick = async () => {
  if (!state.selectedHistoryId) return;
  if (!confirm('Are you sure you want to delete this recorded call?')) return;

  try {
    await fetch(`/api/transcripts/${state.selectedHistoryId}`, { method: 'DELETE' });
    state.selectedHistoryId = null;
    detailActions.style.display = 'none';
    detailCallTitle.textContent = 'Call Details';
    detailCallSubtitle.textContent = 'Select a call from the left to view transcript';
    detailContent.innerHTML = '<div class="empty-state"><p>Call deleted.</p></div>';
    fetchTranscripts();
  } catch (err) {
    alert('Error deleting transcript');
  }
};

refreshHistoryBtn.onclick = fetchTranscripts;

// Settings Modal
openSettingsBtn.onclick = async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.config) {
      settingPublicUrl.value = data.config.publicBaseUrl || '';
      settingFriendNumber.value = data.config.friendPhoneNumber || '';
      settingTwilioFrom.value = data.config.twilioPhoneNumber || '';
      settingSystemPrompt.value = data.config.systemPrompt || '';
    }
    settingsModal.style.display = 'flex';
  } catch (e) {
    alert('Error loading settings');
  }
};

closeSettingsBtn.onclick = () => settingsModal.style.display = 'none';
cancelSettingsBtn.onclick = () => settingsModal.style.display = 'none';

settingsForm.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: settingPublicUrl.value.trim(),
        friendPhoneNumber: settingFriendNumber.value.trim(),
        systemPrompt: settingSystemPrompt.value.trim(),
      })
    });
    settingsModal.style.display = 'none';
    alert('Settings saved successfully!');
  } catch (err) {
    alert('Error saving settings');
  }
};

// Startup
window.onload = () => {
  initWebSocket();
  fetchTranscripts();
};
