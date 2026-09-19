const base = 'https://jhograr-judge.vercel.app';
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
}
async function api(path, opts = {}, token) {
  const r = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { 'x-participant-token': token } : {}) } });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}
const post = (path, body, token) => api(path, { method: 'POST', body: JSON.stringify(body) }, token);
async function chat(code, token, msgs) {
  let last;
  for (const m of msgs) last = await post(`/api/sessions/${code}/action`, { type: 'chat', content: m }, token);
  return last;
}
const confirm = (c, t, verdict = 'yes', text) => post(`/api/sessions/${c}/action`, { type: 'confirm', verdict, text }, t);
const predict = (c, t) => post(`/api/sessions/${c}/action`, { type: 'predict', upsetAbout: 'x', wantedFromYou: 'y', theirFeeling: 'z' }, t);
const state = (c, t) => api(`/api/sessions/${c}`, {}, t).then(r => r.d);

// ---------- 1. validation ----------
check('create rejects bad relationship', (await post('/api/sessions', { relationship: 'enemies' })).status === 400);

// ---------- 2-7. core pair flow with map correction round ----------
const s1 = (await post('/api/sessions', { relationship: 'couple', title: 'Audit 1' })).d;
check('create returns code+token', Boolean(s1.code && s1.token));
let st = await state(s1.code, s1.token);
check('waiting until B joins', st.session.status === 'waiting' && !st.partnerJoined);
check('greeting present', st.messages.length === 1 && st.messages[0].role === 'judge');
const b1 = (await post(`/api/sessions/${s1.code}/join`, {})).d;
check('B joins with token', Boolean(b1.token));
check('second join rejected 409', (await post(`/api/sessions/${s1.code}/join`, {})).status === 409);
st = await state(s1.code, s1.token);
check('status intake after join', st.session.status === 'intake');
await chat(s1.code, s1.token, ['She cancelled dinner again. Obviously she does not care about me.', 'What it meant, mostly', 'I wanted her to tell me earlier', 'Rerun, happens every month', 'An apology and a plan']);
st = await state(s1.code, s1.token);
check('A stage confirm after 5 msgs', st.me.stage === 'confirm');
check('draft has separated interpretation', st.me.perspective.interpretations.length > 0);
check('classify EXPECTATION_MISMATCH', st.me.perspective.conflictTypes.includes('EXPECTATION_MISMATCH'));
const fixRes = await confirm(s1.code, s1.token, 'fix', 'It was the third time, not just again');
check('fix round accepted', fixRes.d.corrected === true);
st = await state(s1.code, s1.token);
check('correction stored', JSON.stringify(st.me.perspective.corrections || []).includes('third time'));
await confirm(s1.code, s1.token, 'yes');
st = await state(s1.code, s1.token);
check('stage predict after confirm', st.me.stage === 'predict');
await predict(s1.code, s1.token);
await chat(s1.code, b1.token, ['I was stuck at work, my phone died. Accusing me felt unfair.', 'Unfair, mostly', 'I wanted trust that delays happen', 'First time', 'Being trusted']);
await confirm(s1.code, b1.token, 'yes');
await predict(s1.code, b1.token);
st = await state(s1.code, s1.token);
check('map built after both done', st.session.status === 'map' && Boolean(st.map));
await post(`/api/sessions/${s1.code}/action`, { type: 'map_feedback', verdict: 'almost', note: 'The agreement about heads-ups was never explicit' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'map_feedback', verdict: 'yes' }, b1.token);
st = await state(s1.code, s1.token);
check('map rebuilt once (stays in map)', st.session.status === 'map' && st.map.rebuilt === 1);
await post(`/api/sessions/${s1.code}/action`, { type: 'map_feedback', verdict: 'yes' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'map_feedback', verdict: 'yes' }, b1.token);
st = await state(s1.code, s1.token);
check('resolution after second confirm', st.session.status === 'resolution' && st.resolutions.length >= 2);

// ---------- 8-9. vote mismatch -> constraints -> rebuild ----------
const opts = st.resolutions;
await post(`/api/sessions/${s1.code}/action`, { type: 'vote', optionId: opts[0].id, stance: 'works' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'vote', optionId: opts[1].id, stance: 'works' }, b1.token);
st = await state(s1.code, s1.token);
check('mismatch -> no overlap flag', st.noOverlap === true && Object.keys(st.votes).length === 0);
await post(`/api/sessions/${s1.code}/action`, { type: 'constraints', text: 'Fixed schedules feel like a chore. Only heads-up rules.' }, s1.token);
st = await state(s1.code, s1.token);
check('options rebuilt with constraint option', st.resolutions.some(o => o.title.includes('Adjusted')) && st.noOverlap === false && Object.keys(st.votes).length === 0);
await post(`/api/sessions/${s1.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'works' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'works' }, b1.token);
st = await state(s1.code, s1.token);
check('agreement drafted', st.session.status === 'agreement' && Boolean(st.agreement));

// ---------- 10-12. agreement change -> re-vote -> followup ----------
await post(`/api/sessions/${s1.code}/action`, { type: 'agreement_verdict', verdict: 'change', note: 'Make the heads-up one word: busy.' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'agreement_verdict', verdict: 'agree' }, b1.token);
st = await state(s1.code, s1.token);
check('change redrafts and resets votes', st.session.status === 'agreement' && Object.keys(st.agreementVotes).length === 0 && st.agreement.figuredOut.includes('Adjustments requested'));
await post(`/api/sessions/${s1.code}/action`, { type: 'agreement_verdict', verdict: 'agree' }, s1.token);
await post(`/api/sessions/${s1.code}/action`, { type: 'agreement_verdict', verdict: 'agree' }, b1.token);
st = await state(s1.code, s1.token);
check('both agree -> followup', st.session.status === 'followup');
await post(`/api/sessions/${s1.code}/action`, { type: 'followup', result: 'failed', reason: 'Same trigger happened' }, s1.token);
st = await state(s1.code, s1.token);
check('failed followup recorded + closed', st.session.status === 'closed' && st.followUp.reason === 'Same trigger happened');

// ---------- 13. rename + delete + auth ----------
await post(`/api/sessions/${s1.code}/action`, { type: 'rename', title: 'The Dinner Dispute' }, s1.token);
st = await state(s1.code, s1.token);
check('rename works', st.session.title === 'The Dinner Dispute');
check('wrong token rejected', (await api(`/api/sessions/${s1.code}`, {}, 'wrong-token-xyz')).status === 401);
check('unknown code rejected', (await api('/api/sessions/JJ-XXXX', {}, s1.token)).status === 401);
const del = await api(`/api/sessions/${s1.code}`, { method: 'DELETE' }, s1.token);
check('delete ok + gone', del.d.ok === true && (await api(`/api/sessions/${s1.code}`, {}, s1.token)).status === 401);

// ---------- 14. no-agreement is valid ----------
const s2 = (await post('/api/sessions', { relationship: 'friends', title: 'Audit 2' })).d;
const b2 = (await post(`/api/sessions/${s2.code}/join`, {})).d;
await chat(s2.code, s2.token, ['He only calls when he needs something. Always one sided.', 'One sided, mostly', 'I want reciprocity', 'Rerun', 'Effort going both ways']);
await chat(s2.code, b2.token, ['I call when I can, life is busy. Fairness is not a scoreboard.', 'Busy, mostly', 'I wanted understanding', 'First time', 'Flexibility']);
for (const t of [s2.token, b2.token]) await confirm(s2.code, t);
for (const t of [s2.token, b2.token]) await predict(s2.code, t);
for (const t of [s2.token, b2.token]) await post(`/api/sessions/${s2.code}/action`, { type: 'map_feedback', verdict: 'yes' }, t);
st = await state(s2.code, s2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'works' }, s2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'no' }, b2.token);
st = await state(s2.code, s2.token);
check('hard no also flags no-overlap', st.noOverlap === true);
await post(`/api/sessions/${s2.code}/action`, { type: 'constraints', text: 'Nothing with scorekeeping.' }, s2.token);
st = await state(s2.code, s2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'works' }, s2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'vote', optionId: st.resolutions[0].id, stance: 'works' }, b2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'agreement_verdict', verdict: 'notready' }, s2.token);
await post(`/api/sessions/${s2.code}/action`, { type: 'agreement_verdict', verdict: 'agree' }, b2.token);
st = await state(s2.code, s2.token);
check('not ready -> closed no-agreement', st.session.status === 'closed' && st.followUp.reason === 'no_agreement_chosen');
await post(`/api/sessions/${s2.code}/action`, { type: 'outcome', path: 'retry' }, s2.token);
st = await state(s2.code, s2.token);
check('outcome retry -> back to resolution', st.session.status === 'resolution');
await api(`/api/sessions/${s2.code}`, { method: 'DELETE' }, s2.token);

// ---------- 15. solo mode ----------
const s3 = (await post('/api/sessions', { relationship: 'other', mode: 'solo' })).d;
st = await state(s3.code, s3.token);
check('solo session starts in intake', st.session.mode === 'solo' && st.session.status === 'intake');
check('solo has no B seat', (await post(`/api/sessions/${s3.code}/join`, {})).status === 403);
await chat(s3.code, s3.token, ['My boyfriend ignored me because he does not care']);
await chat(s3.code, s3.token, ['I feel hurt and invisible']);
await chat(s3.code, s3.token, ['I want to ask him calmly what happened']);
st = await state(s3.code, s3.token);
check('solo done with summary', st.me.stage === 'confirm' && Boolean(st.me.soloSummary));
await confirm(s3.code, s3.token);
st = await state(s3.code, s3.token);
check('solo confirm closes session', st.session.status === 'closed' && st.me.stage === 'done');
await api(`/api/sessions/${s3.code}`, { method: 'DELETE' }, s3.token);

// ---------- 16. safety ----------
const s4 = (await post('/api/sessions', { relationship: 'couple', title: 'Audit safety' })).d;
const b4 = (await post(`/api/sessions/${s4.code}/join`, {})).d;
await post(`/api/sessions/${s4.code}/action`, { type: 'chat', content: 'He hit me last month and threatened to do it again' }, s4.token);
st = await state(s4.code, s4.token);
check('safety locks session', st.session.status === 'safety' && st.me.stage === 'safe_exit' && st.me.safetyFlag);
check('safety copy shown privately', st.messages.some(m => m.content.includes('may not be a normal disagreement')));
check('join blocked during safety halt', (await post(`/api/sessions/${s4.code}/join`, {})).status === 409);
st = await state(s4.code, b4.token);
check('partner sees no disclosure, only pause', st.partnerSafety === true && !JSON.stringify(st).includes('hit'));
await api(`/api/sessions/${s4.code}`, { method: 'DELETE' }, s4.token);
// safety halt before B joins -> join refused outright
const s5 = (await post('/api/sessions', { relationship: 'couple' })).d;
await post(`/api/sessions/${s5.code}/action`, { type: 'chat', content: 'She checks my phone and will not let me go out alone' }, s5.token);
check('halted waiting session refuses join', (await post(`/api/sessions/${s5.code}/join`, {})).status === 403);
await api(`/api/sessions/${s5.code}`, { method: 'DELETE' }, s5.token);

// ---------- 17. say-it ----------
for (const tone of ['clearer', 'firmer', 'softer', 'shorter']) {
  const rr = await post('/api/say', { input: "Tell her she's an idiot for cancelling again", tone });
  check(`say-it ${tone} works`, rr.status === 200 && rr.d.rewrite && !rr.d.rewrite.toLowerCase().includes('idiot'));
}
const bn = await post('/api/say', { input: 'তুমি কখনো আমার কথা ভাবো না', tone: 'clearer' });
check('say-it bangla stays bangla', bn.status === 200 && /[\u0980-\u09FF]/.test(bn.d.rewrite));

// ---------- 18. demo ----------
const demo = (await api('/api/demo')).d;
st = await state(demo.code, demo.token);
check('demo seeded at resolution stage', st.session.status === 'resolution' && st.resolutions.length === 3 && st.session.title === 'The Reply Delay');
check('demo has private history', st.messages.length >= 5);
await api(`/api/sessions/${demo.code}`, { method: 'DELETE' }, demo.token);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
