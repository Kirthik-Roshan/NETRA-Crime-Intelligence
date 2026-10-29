import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
const require = createRequire(import.meta.url);
const { routeConversation } = require('../functions/ai_quickml/conversation.js');

const examples = {
  conversation: ['hi', 'hii', 'Hi NETRA!', 'Hello, how are you?', 'good morning', 'thanks', 'thank you', 'ok', 'bye', 'what can you do?', 'who are you?', 'ನಮಸ್ಕಾರ', 'am new to this application...how can u assisst me here', 'wht are ur functionalities'],
  clarification: ['explain a case using statistical reports n data', 'explain a case', 'summarize this case', 'tell me more', 'What evidence was collected in these cases?', 'is kriti shetty the daughter of chetan shetty'],
  general: ['what is an FIR?', 'Explain how RAG works', 'what is machine learning?', 'what is the capital of India?', 'how can I export a PDF?', 'tell me about photosynthesis', 'quantum entanglement'],
  records: ['Hi, show vehicle theft cases in Mysuru', 'hello show murders', 'Summarize burglary cases', 'show mother murder cases in Mysuru', 'What crimes are recorded in the case files?', 'Who were the victims?', 'How many FIRs were filed in Mysuru?', 'Imran Reddy', 'Who is Imran Reddy?', 'who is deepak kumar', 'Tell me about Ganesh Nayak', 'show FIR 104100019202600001', 'Trace the bank accounts and transaction money trail'],
};
examples.records.push('who is chetan', 'chetan shetty??');
examples.conversation.push('How many languages do you support?', 'Can you make charts?', 'How was your day?', 'Can we chat?', 'Can you talk to me?');
examples.general.push('Who is Albert Einstein?', 'Which charts are available?', 'How can I visualize a report?');
for (const [expected, queries] of Object.entries(examples)) {
  for (const query of queries) assert.equal(routeConversation(query).kind, expected, query);
}
const history = [{ role: 'user', content: 'Show Imran Reddy criminal history' }, { role: 'assistant', content: 'Linked FIR 104100019202600001' }];
assert.equal(routeConversation('hi', history).kind, 'conversation');
assert.equal(routeConversation('who were the victims in those cases?', history).kind, 'records');
assert.equal(routeConversation('summarize', history).kind, 'records');
assert.equal(routeConversation('explain it simply', [...history, {role:'user',content:'What is RAG?'}]).kind, 'general');
for (const query of ['hi how r u', 'hey netra how are you today', 'hello how are you doing']) assert.equal(routeConversation(query, history).kind, 'conversation');
for (const query of ['that is irrelevant', 'you misunderstood', 'i don t understand']) assert.equal(routeConversation(query, history).kind, 'clarification');
const { isAnalysisQuery } = require('../functions/ai_quickml/conversation');
for (const query of ['What is a bar chart?', 'How can I interpret a report chart?']) assert.equal(isAnalysisQuery(query), false);

const platform = require('../functions/ai_quickml/platform.js');
const originals = { ...platform };
const originalFetch = globalThis.fetch;
let searches = 0; let tableReads = 0; let profileRows = []; const audits = [];
const hit = { table:'Firs', row:{ id:1, fir_number:'104100019202600001', crime_type:'Vehicle Theft', district:'Mysuru' } };
Object.assign(platform, {
  createRequestContext: async () => ({ authenticated:true, officer:{id:'test',role:'investigation_officer'}, app:{} }),
  cacheGet: async () => null, cachePut: async () => {},
  searchRecords: async () => { searches++; return {hits:[hit],engine:'test-store'}; },
  listRows: async (_context, table) => { tableReads++; return {rows:table === 'Criminals' ? profileRows : []}; },
  writeAudit: async (_app,_actor,event) => { audits.push(event); return {id:'test-audit',ref:'test-archive'}; },
});
process.env.QML_ORG='test';process.env.QML_PROJECT_ID='test';delete process.env.QML_REFRESH_TOKEN;
const handler = require('../functions/ai_quickml/index.js');
for (const response of [{ result: [{ content: 'Serving answer' }] }, { data: { result: [{ content: 'Serving answer' }] } }, { choices: [{ message: { content: 'Serving answer' } }] }]) {
  assert.equal(handler.__test.quickmlText(response), 'Serving answer');
}
async function ask(query, mode='rag') {
  const req=Readable.from([JSON.stringify({mode,query,prompt:query,history,stream:mode==='rag',refresh:true})]);req.method='POST';req.headers={};
  let body=''; await handler(req,{writeHead(){},write(chunk){body+=chunk;},end(chunk){body+=chunk||'';}});
  const result=body.trim().split('\n').map(line=>JSON.parse(line)).at(-1);
  return result.data || result;
}
try {
  for (const mode of ['rag','chat']) {
    for (const query of ['hi','thanks','what can you do?','am new to this application...how can u assisst me here','wht are ur functionalities','is Kriti Shetty the daughter of Chetan Shetty?','what is machine learning?', 'Who is Albert Einstein?', 'How many languages do you support?', 'Can you make charts?', 'Which charts are available?']) {
      const result=await ask(query,mode);
      assert.equal(searches,0,'conversation must never search records');
      assert.equal(tableReads,0,'conversation must never sample a table');
      assert.deepEqual(result.sources,[]);assert.equal(result.confidence,null);
      assert.doesNotMatch(result.answer,/104100019202600001/);
      assert(audits.at(-1).entity==='conversation');
    }
  }
  const recordAnswer=await ask('Hi, show vehicle theft cases in Mysuru');
  assert.equal(searches,1);assert.equal(recordAnswer.response_kind,'records');
  assert.match(recordAnswer.answer,/104100019202600001/);
  const miss=await ask('Find accused Zqxv Unknownperson');
  assert.equal(miss.response_kind,'no_data');assert.deepEqual(miss.sources,[]);
  assert.doesNotMatch(miss.answer,/104100019202600001/);
  const context=handler.__test.contextualSearchQuery('Who were the victims in those cases?',history);
  assert.match(context,/Imran Reddy/);
  assert.match(handler.__test.contextualSearchQuery('explain a case using statistical reports n data',history),/Imran Reddy/,'case clarification with existing record context must retain its anchor');
  assert.equal(handler.__test.contextualSearchQuery('Summarize burglary cases',history),'Summarize burglary cases','new topic must not inherit old person');
  const generalHistory=[...history,{role:'user',content:'What is RAG?'},{role:'assistant',content:'RAG uses retrieved text to help answer questions.'}];
  assert.match(handler.__test.generalConversationContext(generalHistory),/retrieved text/);
  assert.doesNotMatch(handler.__test.generalConversationContext(generalHistory),/104100019202600001|Imran Reddy/,'general chat must not inherit case facts');
  const endpoints=[];
  process.env.QML_CLIENT_ID='test';process.env.QML_CLIENT_SECRET='test';process.env.QML_REFRESH_TOKEN='test';
  globalThis.fetch = async (url,options) => {
    endpoints.push(String(url));
    if(String(url).includes('oauth/v2/token'))return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}));
    if(String(url).includes('rag/answer'))return new Response(JSON.stringify({answer:'Invented FIR 99999999999999999 proves guilt.',retrieved_nodes:[]}));
    const body=JSON.parse(options.body);
    assert.doesNotMatch(body.messages?.at(-1)?.content || body.prompt,/Relevant live Cloud Scale records|Matching live Cloud Scale records/);
    return new Response(JSON.stringify({result:[{content:'Machine learning learns patterns from examples.'}]}));
  };
  const general=await ask('what is machine learning?');
  assert.match(general.answer,/learns patterns/);
  assert.equal(general.response_kind,'conversation');
  assert(!endpoints.some(url=>url.includes('rag/answer')),'general chat uses LLM, never RAG');
  const missing=await ask('Find accused Zqxv Unknownperson');
  assert.equal(missing.response_kind,'no_data');assert.deepEqual(missing.sources,[]);
  assert.doesNotMatch(missing.answer,/99999999999999999|Machine learning/,'unsourced RAG and LLM answers must be rejected');
  assert.equal(routeConversation('who is chetan').person_name, 'chetan');
  assert.equal(routeConversation('chetan shetty??').person_name, 'chetan shetty');
  profileRows = [{ id: 13, name: 'Chetan Shetty', home_district: 'Kalaburagi' }, { id: 176, name: 'Chetan Desai', home_district: 'Mysuru' }];
  const before = searches;
  const ambiguous = await ask('who is chetan');
  assert.equal(ambiguous.response_kind, 'clarification');
  assert.match(ambiguous.answer, /Chetan Shetty/); assert.match(ambiguous.answer, /Chetan Desai/);
  assert.equal(searches, before, 'ambiguous names must not select a case');
  console.log('Conversation routing: greetings, mixed requests, Kannada, clarification, general chat, no sampling, audit, no-data and follow-up grounding verified.');
} finally { Object.assign(platform,originals);globalThis.fetch=originalFetch; }
