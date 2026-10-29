'use strict';

const ASSISTANT_ROUTING_VERSION = 'intent-v6';
const PROFILE_NAMES = require('./profile-names.json');
const NAME_WORDS = new Set(PROFILE_NAMES.flatMap(name => name.toLowerCase().split(' ')));
const RECORD_TERMS = /\b(firs?|cases?|crimes?|criminals?|accused|suspects?|offenders?|victims?|complainants?|arrests?|investigations?|evidence|burglary|burglaries|thefts?|murders?|assaults?|frauds?|cybercrimes?|narcotics|hotspots?|districts?|police stations?|chargesheets?|charge sheets?|modus|gangs?|vehicles?|number plates?|money trail|transactions?|bank accounts?)\b|ಪ್ರಕರಣ|ಅಪರಾಧ|ಆರೋಪ|ಶಂಕಿತ|ಸಾಕ್ಷ|ಬಂಧನ|ದೂರು|ಜಿಲ್ಲೆ|ಕಳ್ಳತನ|ಕೊಲೆ|ಠಾಣೆ/i;
const VISUAL_TERMS = /\b(charts?|graphs?|plots?|visuali[sz](?:e|ation|ations)|visual(?:ly)?\s+(?:representation|summary|report)|graphical(?:ly)?|pictorial|infographic|diagram)\b|ಚಿತ್ರರೂಪ|ದೃಶ್ಯರೂಪ|ರೇಖಾಚಿತ್ರ/i;
const ANALYSIS_TERMS = /\b(charts?|graphs?|maps?|plots?|trends?|patterns?|hotspots?|distribution|breakdown|compare|comparison|warnings?|forecast|what changed|how many|counts?|statistics|stats|by district|by month|connections|supporting evidence|conflicting evidence|exclude source|restore source)\b|ನಕ್ಷೆ|ಹೋಲಿಸ|ಪ್ರವೃತ್ತಿ|ಎಷ್ಟು|ವಿತರಣೆ|ಮುನ್ನೆಚ್ಚರಿಕೆ|ಸಂಬಂಧಗಳ|ಅಂಕಿಅಂಶ/i;
const ANALYSIS_FOLLOWUP = /\b(these|those|same|them|that|this|instead|now|only|also|selected|two periods|exclude|restore)\b|^(?:show|plot|draw) (?:me )?(?:a |the )?(?:map|chart|graph)[?.!]*$|^by (?:district|month)|ಅದೇ|ಅವು|ಈ|ಮಾತ್ರ/i;

function isGeneralExplanation(query) {
  const text = String(query || '').toLowerCase().trim();
  return /^(?:(?:please|could you|can you)\s+)?(?:what (?:is|are|does)|define|meaning of|how (?:do|does|can|to)|explain (?:how|what))\b/.test(text)
    && !/\b(?:these|those|attached|uploaded|my|our|recorded|registered|filed|linked|total|amount|loss)\b|\b(?:in|from|inside) (?:the |this )?(?:report|document|file)\b|\b(?:report|document|file) (?:about|says?|contains?)\b|\d{5,}/.test(text);
}

function isAnalysisQuery(query, context, history = []) {
  const text = String(query || '').trim();
  const route = routeConversation(text, history);
  if (route.kind === 'conversation') return false;
  if (route.kind === 'general' && route.answer) return false;
  if (route.kind === 'general' && isGeneralExplanation(text)) return false;
  if (VISUAL_TERMS.test(text)) return true;
  if (!ANALYSIS_TERMS.test(text) && /victim|complainant|arrest|summari[sz]e|who|evidence collected/i.test(text)) return false;
  return ANALYSIS_TERMS.test(text) || (!!context && ANALYSIS_FOLLOWUP.test(text));
}

// Most recent topic only: a chart follow-up must not resurrect an older case
// after the officer has moved to a general conversation.
function analysisAnchor(history = []) {
  for (const message of [...(Array.isArray(history) ? history : [])].reverse()) {
    if (message?.role !== 'user') continue;
    const route = routeConversation(message.content);
    if (route.kind === 'conversation' || route.kind === 'clarification') continue;
    return route.kind === 'records' ? String(message.content).slice(0, 1000) : '';
  }
  return '';
}

function routeConversation(query, history = [], language = 'en') {
  const original = String(query || '').trim();
  const text = original.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b(wht|wat)\b/g, 'what').replace(/\bur\b/g, 'your').replace(/\bu\b/g, 'you').replace(/\babt\b/g, 'about').replace(/\bassisst\b/g, 'assist');
  const kn = language === 'kn' || /[\u0c80-\u0cff]/.test(original);
  const reply = (kind, en, kannada) => ({ kind, answer: kn ? kannada : en });
  const greeting = text.replace(/^(?:hi+|hey+|hello+|namaste|namaskara)(?: netra)?\s+/, '').replace(/\br\b/g, 'are');
  if (/^(?:how are you(?: doing| today)?|how s your day|what s up)$/.test(greeting)) {
    return reply('conversation', 'I’m here and ready to help. How are you doing, and what would you like to talk about?', 'ನಾನು ಇಲ್ಲಿದ್ದೇನೆ, ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧ. ನೀವು ಹೇಗಿದ್ದೀರಿ? ಯಾವುದರ ಬಗ್ಗೆ ಮಾತನಾಡಲು ಬಯಸುತ್ತೀರಿ?');
  }
  if (/^(?:that (?:is|was|s) (?:wrong|incorrect|irrelevant|not what i (?:asked|meant))|you (?:misunderstood|didn t understand)|i (?:don t|didn t) (?:understand|get it)|ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ)$/.test(text)) {
    return reply('clarification', 'Let’s correct that. Which part should I revisit: the question’s meaning, the figures, the selected records, or the explanation? I won’t choose a different case or invent replacement data.', 'ಅದನ್ನು ಸರಿಪಡಿಸೋಣ. ಪ್ರಶ್ನೆಯ ಅರ್ಥ, ಅಂಕಿಅಂಶಗಳು, ಆಯ್ದ ದಾಖಲೆಗಳು ಅಥವಾ ವಿವರಣೆಯಲ್ಲಿ ಯಾವ ಭಾಗವನ್ನು ಮರುಪರಿಶೀಲಿಸಬೇಕು? ಬೇರೆ ಪ್ರಕರಣ ಅಥವಾ ಕಲ್ಪಿತ ದತ್ತಾಂಶವನ್ನು ಬಳಸುವುದಿಲ್ಲ.');
  }
  if (/\b(?:how many|which|what)\b.*\blanguages?\b.*\b(?:you|netra|support|available)\b/.test(text)) {
    return reply('conversation', 'NETRA supports English and Kannada for questions and replies. Use the language switch for the interface and choose the microphone language before speaking. You can ask follow-up questions without repeating a case scope.', 'NETRA ಪ್ರಶ್ನೆ ಮತ್ತು ಉತ್ತರಗಳಿಗೆ ಇಂಗ್ಲಿಷ್ ಮತ್ತು ಕನ್ನಡ ಬೆಂಬಲಿಸುತ್ತದೆ. ಅಂತರಮುಖಕ್ಕೆ ಭಾಷೆ ಸ್ವಿಚ್ ಬಳಸಿ; ಮಾತನಾಡುವ ಮೊದಲು ಮೈಕ್ರೊಫೋನ್ ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ. ಪ್ರಕರಣದ ವ್ಯಾಪ್ತಿಯನ್ನು ಮತ್ತೆ ಹೇಳದೆ ಮುಂದಿನ ಪ್ರಶ್ನೆ ಕೇಳಬಹುದು.');
  }
  if (/^(?:can|could) you\s+(?:make|draw|show|create|display)\s+(?:me\s+)?(?:charts?|graphs?|visuali[sz]ations?)$/.test(text)) {
    return reply('conversation', 'Yes. Ask “Show crime counts by district”, “Show monthly crime trends”, or attach a report with a labelled numeric table. I’ll show the chart with its values and sources. Which statistics would you like to explore?', 'ಹೌದು. “ಜಿಲ್ಲೆವಾರು ಅಪರಾಧದ ಎಣಿಕೆ ತೋರಿಸಿ” ಎಂದು ಕೇಳಿ ಅಥವಾ ಸಂಖ್ಯೆಗಳ ಸ್ಪಷ್ಟ ಕೋಷ್ಟಕವಿರುವ ವರದಿ ಸೇರಿಸಿ. ಸಂಖ್ಯೆಗಳು ಮತ್ತು ಮೂಲಗಳೊಂದಿಗೆ ಚಾರ್ಟ್ ತೋರಿಸುತ್ತೇನೆ. ಯಾವ ಅಂಕಿಅಂಶ ಬೇಕು?');
  }
  if (/\b(?:can|could|will) you\b/.test(text) && /\b(?:chat|talk|converse)\b/.test(text) && !RECORD_TERMS.test(text)) {
    return reply('conversation', 'Of course. We can chat normally or work through a question together. What would you like to discuss?', 'ಖಂಡಿತ. ಸಾಮಾನ್ಯವಾಗಿ ಮಾತನಾಡಬಹುದು ಅಥವಾ ಪ್ರಶ್ನೆಯನ್ನು ಒಟ್ಟಿಗೆ ಪರಿಶೀಲಿಸಬಹುದು. ಯಾವುದರ ಬಗ್ಗೆ ಮಾತನಾಡೋಣ?');
  }
  if (/\b(?:what|which)\b.*\b(?:charts?|visuali[sz]ations?)\b.*\b(?:can|support|available)\b|\bhow (?:do|can) i\b.*\b(?:chart|visuali[sz]e|graph)\b/.test(text)) {
    return reply('general', 'I can show bar charts, line charts, pie charts and maps from recorded FIRs. Try “Show crime counts by district” or “Show vehicle theft trends by month”. After an answer, ask “Show these statistics as a pie chart”. You can also attach a report with one clear category/value table and ask me to chart it. Each chart keeps the values and source references visible.', 'ದಾಖಲಾದ ಎಫ್‌ಐಆರ್‌ಗಳಿಂದ ಬಾರ್, ರೇಖಾ, ಪೈ ಚಾರ್ಟ್ ಮತ್ತು ನಕ್ಷೆ ತೋರಿಸಬಹುದು. “ಜಿಲ್ಲೆವಾರು ಅಪರಾಧದ ಎಣಿಕೆ ತೋರಿಸಿ” ಎಂದು ಕೇಳಿ. ಉತ್ತರದ ನಂತರ ಅದೇ ಅಂಕಿಅಂಶಗಳ ಚಾರ್ಟ್ ಕೇಳಬಹುದು. ಸ್ಪಷ್ಟ ವರ್ಗ ಮತ್ತು ಸಂಖ್ಯೆಯ ಕೋಷ್ಟಕವಿರುವ ವರದಿಯನ್ನೂ ಸೇರಿಸಬಹುದು. ಮೂಲಗಳು ಮತ್ತು ಸಂಖ್ಯೆಗಳು ಕಾಣಿಸುತ್ತವೆ.');
  }
  if (/^(?:how (?:was|is) your day|how (?:are|r) (?:you|u)(?: doing)?|what about you|how about you|are you there|you there|can you hear me|can we chat|let s (?:chat|talk)|ನಿಮ್ಮ ದಿನ ಹೇಗಿದೆ)$/.test(text)) {
    return reply('conversation', 'I’m here and ready to help. We can chat, explain a concept, or explore a case together. What’s on your mind?', 'ನಾನು ಇಲ್ಲಿದ್ದೇನೆ, ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧ. ಮಾತನಾಡಬಹುದು, ವಿಷಯವನ್ನು ವಿವರಿಸಬಹುದು ಅಥವಾ ಪ್ರಕರಣವನ್ನು ಪರಿಶೀಲಿಸಬಹುದು. ನಿಮಗೆ ಏನು ಬೇಕು?');
  }
  if (/^(?:(?:hi+|hey+|hello+|hiya|namaste|namaskara)(?:\s+(?:netra|there|team|buddy|sir))?(?:\s+how (?:are you|s it going|do you do))?|good (?:morning|afternoon|evening)|how are you|how s it going|ನಮಸ್ಕಾರ|ಹಾಯ್|ಹೇಗಿದ್ದೀರಾ)$/.test(text)) {
    return reply('conversation', 'Hi! How can I help you today?', 'ನಮಸ್ಕಾರ! ಇಂದು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?');
  }
  if (/^(?:thanks?(?: you)?|thank you(?: so much)?|thx|thankyou|ಧನ್ಯವಾದಗಳು)(?:\s+(?:netra|very much|a lot))?$/.test(text)) {
    return reply('conversation', 'You’re welcome. What would you like to look into next?', 'ಸ್ವಾಗತ. ಮುಂದೆ ಏನನ್ನು ಪರಿಶೀಲಿಸೋಣ?');
  }
  if (/^(?:ok(?:ay)?|alright|cool|great|got it|understood|yes|no|ಸರಿ|ಹೌದು|ಇಲ್ಲ)$/.test(text)) {
    return reply('conversation', 'Got it. What would you like to do next?', 'ಸರಿ. ಮುಂದೆ ಏನು ಮಾಡೋಣ?');
  }
  if (/^(?:bye|goodbye|see you|good night|ಶುಭ ರಾತ್ರಿ)$/.test(text)) {
    return reply('conversation', 'Goodbye. I’ll be here when you need help.', 'ಮತ್ತೆ ಭೇಟಿಯಾಗೋಣ. ಸಹಾಯ ಬೇಕಾದಾಗ ಕೇಳಿ.');
  }
  if (/^(?:(?:what|who) (?:are|is) (?:you|netra)|what can you do|(?:can|could) you help(?: me)?|help(?: me)?|how (?:do|can) i use (?:you|netra)|ನೀವು ಯಾರು|ಸಹಾಯ)$/.test(text)) {
    return reply('conversation', 'I’m NETRA, your investigation assistant. I can search FIRs, summarize cases, explore recorded links and explain the results in English or Kannada. Tell me what you need; I’ll ask for missing details instead of choosing a case for you.', 'ನಾನು NETRA, ನಿಮ್ಮ ತನಿಖಾ ಸಹಾಯಕ. FIR ಹುಡುಕಾಟ, ಪ್ರಕರಣದ ಸಾರಾಂಶ ಮತ್ತು ದಾಖಲಾಗಿರುವ ಸಂಬಂಧಗಳನ್ನು ಇಂಗ್ಲಿಷ್ ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ ವಿವರಿಸಬಹುದು. ನಿಮಗೆ ಏನು ಬೇಕು ಹೇಳಿ; ವಿವರಗಳು ಸಾಲದಿದ್ದರೆ ಸ್ಪಷ್ಟೀಕರಣ ಕೇಳುತ್ತೇನೆ.');
  }
  if (/\b(?:new to (?:this|the|your) (?:app|application|platform)|how (?:can|could|will|do) you (?:help|assist)|(?:what|which) (?:are )?your (?:functionalities|functions|features|capabilities)|what (?:all )?can (?:you|netra) (?:help|do)|how (?:do|can) i (?:get started|use (?:this|the) (?:app|application)))\b/.test(text) && !RECORD_TERMS.test(text)) {
    return reply('conversation', 'I can help you get started with NETRA. Ask for an FIR number, a person’s full name, or an offence and district. I can summarize recorded cases, explore links and crime trends, and explain the sources. Attach a PDF or scanned document to ask about its text; use Photo for a synthetic reference portrait. Evidence Analysis lets you scan an exhibit and ask follow-up questions. You can use English or Kannada, voice input, and Export PDF to save this conversation. What would you like to try?', 'NETRA ಬಳಸಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. FIR ಸಂಖ್ಯೆ, ವ್ಯಕ್ತಿಯ ಪೂರ್ಣ ಹೆಸರು, ಅಥವಾ ಅಪರಾಧದ ಪ್ರಕಾರ ಮತ್ತು ಜಿಲ್ಲೆಯನ್ನು ನೀಡಿ. ಪ್ರಕರಣದ ಸಾರಾಂಶ, ಸಂಬಂಧಗಳು ಮತ್ತು ಪ್ರವೃತ್ತಿಗಳನ್ನು ಮೂಲ ದಾಖಲೆಗಳೊಂದಿಗೆ ವಿವರಿಸಬಹುದು. PDF ಅಥವಾ ಸ್ಕ್ಯಾನ್ ದಾಖಲೆಯನ್ನು ಸೇರಿಸಿ ಅದರ ಪಠ್ಯದ ಬಗ್ಗೆ ಕೇಳಬಹುದು. ಸಾಕ್ಷ್ಯ ವಿಶ್ಲೇಷಣೆಯ ನಂತರ ಪ್ರಶ್ನೆಗಳನ್ನೂ ಕೇಳಬಹುದು. ಇಂಗ್ಲಿಷ್ ಅಥವಾ ಕನ್ನಡ, ಧ್ವನಿ ಮತ್ತು PDF ರಫ್ತು ಲಭ್ಯವಿದೆ. ಮೊದಲು ಏನನ್ನು ಪ್ರಯತ್ನಿಸೋಣ?');
  }
  if (/\b(?:how (?:can|do|to) i? ?(?:export|download|save)|exporting)\b/.test(text) && /\b(?:pdf|conversation|chat|report)\b/.test(text)) {
    return reply('general', 'After an answer appears, choose Export PDF at the top of the Assistant. NETRA generates the conversation report and downloads it locally; a confirmed library save also appears under Reports → Saved reports. Allow downloads if your browser asks.', 'ಉತ್ತರ ಬಂದ ನಂತರ Assistant ಮೇಲಿರುವ Export PDF ಆಯ್ಕೆ ಮಾಡಿ. ಸಂಭಾಷಣೆಯ ವರದಿ ನಿಮ್ಮ ಸಾಧನಕ್ಕೆ ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತದೆ. ಸಂಗ್ರಹ ದೃಢಪಟ್ಟರೆ Reports → Saved reports ನಲ್ಲಿಯೂ ಕಾಣುತ್ತದೆ.');
  }
  if (/\b(?:daughter|son|father|mother|wife|husband|sibling|sister|brother)\s+(?:of|is)\b|\b(?:is|are|was|were)\b.{0,100}\b(?:daughter|son|father|mother|wife|husband|sibling|sister|brother|married|related by blood)\b|ಕುಟುಂಬ ಸಂಬಂಧ|ಯಾರ ಮಗಳು|ಯಾರ ಮಗ/.test(text)) {
    return reply('clarification', 'I can’t establish a family relationship from names or shared case links. The current KSP records do not provide a verified family-relationship register. Share a relevant source document or a specific recorded relationship to check; I won’t infer one.', 'ಹೆಸರು ಅಥವಾ ಒಂದೇ ಪ್ರಕರಣದ ಸಂಪರ್ಕದಿಂದ ಕುಟುಂಬ ಸಂಬಂಧವನ್ನು ನಿರ್ಧರಿಸಲಾಗದು. ಈಗಿನ KSP ದಾಖಲೆಗಳಲ್ಲಿ ಪರಿಶೀಲಿತ ಕುಟುಂಬ ಸಂಬಂಧಗಳ ನೋಂದಣಿ ಇಲ್ಲ. ಪರಿಶೀಲಿಸಲು ಸಂಬಂಧಿತ ಮೂಲ ದಾಖಲೆ ಬೇಕು; ಸಂಬಂಧವನ್ನು ಊಹಿಸುವುದಿಲ್ಲ.');
  }
  const previousTopic = Array.isArray(history) ? history.slice(-12).reverse()
    .filter(message => message?.role === 'user')
    .map(message => routeConversation(message.content, [], language).kind)
    .find(kind => kind === 'records' || kind === 'general') : null;
  const hasRecordHistory = previousTopic === 'records';
  const reference = /\b(those|these|that case|this case|it|them|same|tell me more|more details)\b|ಅದೇ|ಅವು|ಆ ಪ್ರಕರಣ/i.test(text);
  if (previousTopic === 'general' && reference && !RECORD_TERMS.test(text) && !VISUAL_TERMS.test(text)) return { kind: 'general', answer: '' };
  const vagueCase = /^(?:(?:please|can you|could you)\s+)?(?:explain|describe|summari[sz]e|analyse|analyze|tell me about)\s+(?:(?:a|one|this|that|the)\s+)?case(?:\s+(?:using|with)\s+(?:statistical|reports?|and|n|data|statistics|analysis|\s)+)?$/.test(text);
  if ((vagueCase || /^(?:summari[sz]e|explain|tell me more|more details)$/.test(text) || reference) && !VISUAL_TERMS.test(text) && !hasRecordHistory && (vagueCase || !RECORD_TERMS.test(text) || /\b(?:this|that|those|these)\s+cases?\b/.test(text))) {
    return reply('clarification', 'Which case should I analyze? Share an FIR or case number, a person’s name, or an offence and district. I can then summarize the recorded facts and relevant statistics without choosing an unrelated case.', 'ಯಾವ ಪ್ರಕರಣವನ್ನು ವಿಶ್ಲೇಷಿಸಬೇಕು? FIR ಅಥವಾ ಪ್ರಕರಣ ಸಂಖ್ಯೆ, ವ್ಯಕ್ತಿಯ ಹೆಸರು, ಅಥವಾ ಅಪರಾಧದ ಪ್ರಕಾರ ಮತ್ತು ಜಿಲ್ಲೆಯನ್ನು ತಿಳಿಸಿ. ನಂತರ ಸಂಬಂಧಿತ ದಾಖಲೆಗಳು ಮತ್ತು ಅಂಕಿಅಂಶಗಳನ್ನು ವಿವರಿಸಬಹುದು.');
  }
  const namedPerson = text.match(/^(?:who is|tell me about|look up|lookup)\s+([\p{L}]+(?:\s+[\p{L}]+){0,3})$/u)?.[1];
  const notPerson = /^(?:the|a|an|this|that|your|our|my|netra|you|rag|machine|artificial|crime|evidence|weather|quantum|india|karnataka|police)\b/;
  if (namedPerson && !notPerson.test(namedPerson) && !RECORD_TERMS.test(namedPerson) && (/^(look up|lookup)\b/.test(text) || namedPerson.split(' ').every(word => NAME_WORDS.has(word)))) {
    return { kind: 'records', answer: '', person_name: namedPerson };
  }
  if (/^[\p{L}]{2,}(?:\s+[\p{L}]{2,}){1,3}$/u.test(text) && text.split(' ').every(word => NAME_WORDS.has(word)) && !RECORD_TERMS.test(text)) {
    return { kind: 'records', answer: '', person_name: text };
  }
  // Definitions and how-to questions need an explanation, not a record search.
  if (/^(?:what (?:is|does|do|are)|define|meaning of|how (?:do|does|can|to)|explain (?:what|how))\b/.test(text) && !/\b(?:in|from|for|linked|recorded|registered|filed|pending|my|our|these|those)\b|\d{4,}/.test(text)) {
    return { kind: 'general', answer: '' };
  }
  if (RECORD_TERMS.test(text) || /\d{5,}/.test(text) || ((reference || /^(?:summari[sz]e|explain)$/.test(text)) && hasRecordHistory) || /^(?:show|find|search|look up|lookup)\b/.test(text)) {
    return { kind: 'records', answer: '' };
  }
  return { kind: 'general', answer: '' };
}

function conversationUnavailable(language) {
  return language === 'kn'
    ? 'ಸಂಭಾಷಣೆಯ AI ಸೇವೆ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ. ಈ ಸಂದೇಶಕ್ಕೆ ಪ್ರಕರಣದ ದಾಖಲೆಗಳನ್ನು ಹುಡುಕಿಲ್ಲ.'
    : 'The conversational AI service is temporarily unavailable. Please try again. I haven’t searched case records for this message.';
}

module.exports = { ASSISTANT_ROUTING_VERSION, routeConversation, conversationUnavailable, isAnalysisQuery, isGeneralExplanation, ANALYSIS_FOLLOWUP, VISUAL_TERMS, analysisAnchor };
