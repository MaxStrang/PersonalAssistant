(() => {
  'use strict';
  const B = window.Brain;
  const KEY = 'snygging-v1';

  // ================= ÄNDRA HÄR: dina förinställda checklistor =================
  // Nya listor du lägger till här dyker upp automatiskt nästa gång appen laddas.
  const DEFAULT_LISTS = [
    { name: 'Packlista bandy', items: ['Skridskor', 'Klubba', 'Hjälm', 'Handskar', 'Benskydd', 'Vattenflaska', 'Ombyte', 'Handduk'] },
    { name: 'Morgonrutin', items: ['Dricka vatten', 'Frukost', 'Borsta tänderna', 'Packa lunch', 'Kolla kalendern'] },
    { name: 'Handla', items: ['Mjölk', 'Bröd', 'Ägg', 'Kaffe'] },
  ];
  // ============================================================================

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Lagring ----------
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* tomt */ }
    s = s || {};
    s.events = s.events || [];
    s.checklists = s.checklists || [];
    s.seeded = s.seeded || [];
    for (const d of DEFAULT_LISTS) {
      if (s.seeded.includes(d.name)) continue;
      s.seeded.push(d.name);
      if (!s.checklists.some(c => c.name.toLowerCase() === d.name.toLowerCase()))
        s.checklists.push({ id: B.uid(), name: d.name, items: d.items.map(text => ({ text, done: false })) });
    }
    return s;
  }
  let state = load();
  const persist = () => localStorage.setItem(KEY, JSON.stringify(state));
  // save() = en ändring gjord av dig → stämpla tid och synka
  const save = () => { state.updatedAt = Date.now(); persist(); Sync.schedule(); };
  persist();

  // ---------- Flikar ----------
  let tab = 'cal';
  const openLists = new Set();
  function showTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#settingsBtn').onclick = () => showTab(tab === 'settings' ? 'cal' : 'settings');

  // ---------- Rendering ----------
  let editingId = null;
  function renderCal(flashId) {
    const now = new Date(), today = B.iso(now);
    const evs = state.events.filter(e => e.date >= today).sort(B.sortEv);
    if (!evs.length) {
      $('#calList').innerHTML = '<p class="empty">Inget inplanerat. Tryck på knappen och säg t.ex. "Lägg till bandyträning imorgon kl 21–22".</p>';
      return;
    }
    let html = '', last = '';
    for (const e of evs) {
      if (e.date !== last) { html += `<h3>${esc(B.cap(B.sayDate(e.date, now)))}</h3>`; last = e.date; }
      if (e.id === editingId) {
        html += `<form class="ev edit" data-edit-ev="${e.id}">
          <input name="title" value="${esc(e.title)}" placeholder="Titel">
          <div class="grid">
            <label>Dag<input type="date" name="date" value="${e.date}"></label>
            <label>Samling<input type="time" name="gather" value="${e.gather || ''}"></label>
            <label>Start<input type="time" name="start" value="${e.start || ''}"></label>
            <label>Slut<input type="time" name="end" value="${e.end || ''}"></label>
          </div>
          <div class="row"><button>Spara</button><button type="button" class="ghost" data-cancel-edit>Avbryt</button></div>
        </form>`;
        continue;
      }
      const time = e.start ? e.start + (e.end ? '–' + e.end : '') : 'Heldag';
      html += `<div class="ev${e.id === flashId ? ' flash' : ''}" data-open-ev="${e.id}">
        <div class="time">${time}</div>
        <div class="t">${esc(e.title)}${e.gather ? `<small>Samling ${e.gather}</small>` : ''}</div>
        <button class="del" data-del-ev="${e.id}" aria-label="Ta bort">✕</button></div>`;
    }
    $('#calList').innerHTML = html;
  }

  function renderLists() {
    $('#lists').innerHTML = state.checklists.map(c => {
      const done = c.items.filter(i => i.done).length;
      const isOpen = openLists.has(c.id) || c.id === state.activeList;
      return `<details class="list" data-list="${c.id}" ${isOpen ? 'open' : ''}>
        <summary>${esc(c.name)} <span class="count${done === c.items.length && c.items.length ? ' done' : ''}">${done}/${c.items.length}</span></summary>
        ${c.items.map((it, i) => `<label class="item${it.done ? ' done' : ''}">
            <input type="checkbox" data-l="${c.id}" data-i="${i}" ${it.done ? 'checked' : ''}>
            <span>${esc(it.text)}</span>
            <button class="del" data-del-item="${c.id}:${i}" aria-label="Ta bort">✕</button></label>`).join('')}
        <form class="row" data-add-item="${c.id}" style="padding:0 14px">
          <input placeholder="Lägg till punkt…" autocomplete="off"><button class="small">+</button></form>
        <div class="list-actions">
          <button class="ghost small" data-reset="${c.id}">Nollställ</button>
          <button class="ghost small" data-del-list="${c.id}">Ta bort lista</button>
        </div></details>`;
    }).join('');
  }

  function render(flashId) { renderCal(flashId); renderLists(); }

  // Klick i kalender/listor (event delegation)
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.delEv) { if (confirm('Ta bort aktiviteten?')) { state.events = state.events.filter(x => x.id !== t.dataset.delEv); save(); render(); } return; }
    if (t.closest && t.closest('[data-cancel-edit]')) { editingId = null; render(); return; }
    const openEv = t.closest && t.closest('[data-open-ev]');
    if (openEv) { editingId = openEv.dataset.openEv; render(); return; }
    if (t.dataset.delItem) { e.preventDefault(); const [l, i] = t.dataset.delItem.split(':'); state.checklists.find(c => c.id === l).items.splice(+i, 1); save(); render(); }
    if (t.dataset.reset) { state.checklists.find(c => c.id === t.dataset.reset).items.forEach(i => i.done = false); save(); render(); }
    if (t.dataset.delList && confirm('Ta bort listan?')) { state.checklists = state.checklists.filter(c => c.id !== t.dataset.delList); save(); render(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.l) { state.checklists.find(c => c.id === t.dataset.l).items[+t.dataset.i].done = t.checked; state.activeList = t.dataset.l; save(); render(); }
  });
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.dataset && d.dataset.list) { d.open ? openLists.add(d.dataset.list) : openLists.delete(d.dataset.list); }
  }, true);
  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.dataset.editEv) {
      e.preventDefault();
      const ev = state.events.find(x => x.id === f.dataset.editEv);
      const v = n => f.elements[n].value.trim();
      if (ev && v('title') && v('date')) {
        Object.assign(ev, { title: v('title'), date: v('date'), start: v('start') || null, end: v('end') || null, gather: v('gather') || null });
        save();
      }
      editingId = null; render(ev && ev.id);
      return;
    }
    if (f.dataset.addItem) {
      e.preventDefault();
      const v = f.querySelector('input').value.trim();
      if (v) { state.checklists.find(c => c.id === f.dataset.addItem).items.push({ text: B.cap(v), done: false }); openLists.add(f.dataset.addItem); save(); render(); }
    }
  });
  $('#newListForm').onsubmit = e => {
    e.preventDefault();
    const v = e.target.name.value.trim();
    if (!v) return;
    const c = { id: B.uid(), name: B.cap(v), items: [] };
    state.checklists.push(c); openLists.add(c.id); e.target.reset(); save(); render();
  };

  // ---------- Chat ----------
  function addMsg(who, text) {
    const chat = $('#chat');
    const d = document.createElement('div');
    d.className = 'msg ' + who; d.textContent = text;
    chat.appendChild(d);
    while (chat.children.length > 2) chat.firstChild.remove();
    clearTimeout(addMsg.t);
    addMsg.t = setTimeout(() => { chat.innerHTML = ''; }, 15000);
  }

  // ---------- Röst: tal ut ----------
  // Två motorer: telefonens inbyggda röst, eller Azure neural (mycket mer mänsklig).
  const TTS_KEY = 'snygging-tts';
  const ttsCfg = () => { try { return JSON.parse(localStorage.getItem(TTS_KEY)) || {}; } catch (e) { return {}; } };
  const synth = window.speechSynthesis;
  const player = new Audio();          // en och samma ljudspelare (krävs för iPhone)
  let voices = [], speaking = false, stopCurrent = null;

  // Ranka röster: neurala/"förbättrade" röster först
  const voiceScore = v => (/natural|neural|online|premium|enhanced|förbättrad|siri/i.test(v.name) ? 10 : 0)
    + (/google/i.test(v.name) ? 5 : 0) + (/sofie|hillevi|alva|klara/i.test(v.name) ? 2 : 0);

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith('sv'))
      .sort((a, b) => voiceScore(b) - voiceScore(a));
    $('#voiceSelect').innerHTML = voices.length
      ? voices.map(v => `<option ${v.name === state.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      : '<option>Ingen svensk röst hittades</option>';
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  const pickVoice = () => voices.find(v => v.name === state.voice) || voices[0] || null;

  function browserSpeak(text) {
    return new Promise(resolve => {
      if (!synth) return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE'; u.rate = 1.0; u.pitch = 1.0;
      const v = pickVoice(); if (v) u.voice = v;
      const guard = setTimeout(resolve, 2500 + text.length * 90); // iOS missar ibland onend
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      stopCurrent = () => { synth.cancel(); resolve(); };
      synth.speak(u);
    });
  }

  async function azureSpeak(text) {
    const c = ttsCfg();
    const xml = text.replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sv-SE">
      <voice name="${c.voice || 'sv-SE-SofieNeural'}"><prosody rate="+4%">${xml}</prosody></voice></speak>`;
    const r = await fetch(`https://${c.region || 'swedencentral'}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': c.key, 'Content-Type': 'application/ssml+xml',
                 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
      body: ssml,
    });
    if (!r.ok) throw new Error('Azure svarade ' + r.status);
    const url = URL.createObjectURL(await r.blob());
    player.src = url;
    await player.play();
    await new Promise(resolve => {
      player.onended = player.onerror = resolve;
      stopCurrent = () => { player.pause(); resolve(); };
    });
    URL.revokeObjectURL(url);
  }

  async function speak(text, done) {
    speaking = true;
    let errMsg = null;
    setOrb('speaking', 'Snygging pratar…');
    try {
      if (ttsCfg().engine === 'azure' && ttsCfg().key) await azureSpeak(text);
      else await browserSpeak(text);
    } catch (err) {
      errMsg = 'Azure-rösten funkar inte (' + err.message + ') – kolla nyckel och region';
      await browserSpeak(text);
    }
    const wasStopped = !speaking;
    speaking = false; stopCurrent = null;
    setOrb('idle', errMsg);
    if (!wasStopped && done) done();
  }
  function stopSpeaking() { speaking = false; if (stopCurrent) stopCurrent(); setOrb('idle'); }

  // Inställningar för rösten
  function initVoiceSettings() {
    const c = ttsCfg();
    $('#engineSelect').value = c.engine || 'browser';
    $('#azureKey').value = c.key ? '••••••••' : '';
    $('#azureRegion').value = c.region || 'swedencentral';
    $('#azureVoice').value = c.voice || 'sv-SE-SofieNeural';
    const toggle = () => { $('#azureBox').hidden = $('#engineSelect').value !== 'azure'; };
    toggle();
    const store = () => {
      const k = $('#azureKey').value.trim();
      localStorage.setItem(TTS_KEY, JSON.stringify({
        engine: $('#engineSelect').value,
        key: k.startsWith('•') ? ttsCfg().key : k,
        region: $('#azureRegion').value.trim() || 'swedencentral',
        voice: $('#azureVoice').value,
      }));
      toggle();
    };
    ['#engineSelect', '#azureKey', '#azureRegion', '#azureVoice'].forEach(s => $(s).onchange = store);
    $('#voiceSelect').onchange = e => { state.voice = e.target.value; save(); };
    $('#testVoice').onclick = () => { unlockAudio(); speak('Hej snygging! Så här låter jag nu. Vad vill du göra idag?'); };
  }

  // iPhone kräver att ljud "låses upp" i ett riktigt tryck
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return; unlocked = true;
    if (synth) synth.speak(new SpeechSynthesisUtterance(' '));
    player.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
    player.play().catch(() => {});
  }

  // ---------- Röst: lyssna ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, convo = false, stopListening = null;

  function setOrb(mode, text) {
    $('#orb').className = mode === 'idle' ? '' : mode;
    $('#status').textContent = text != null ? text : (mode === 'idle' ? 'Tryck och prata' : '');
  }

  function listen() {
    if (!SR) { setOrb('idle', 'Röststyrning stöds inte här – använd Chrome (Android/dator) eller Safari (iPhone)'); return; }
    let heard = '', handled = false, silence = null;

    // Körs EN gång när du pratat klart – oavsett om det är tystnad, knapptryck eller att webbläsaren slutar själv
    const finish = () => {
      if (handled) return;
      handled = true;
      clearTimeout(silence);
      const r = rec; rec = null; stopListening = null;
      try { r && r.abort(); } catch (e) { /* redan stoppad */ }
      if (heard.trim()) process(heard.trim());
      else { convo = false; setOrb('idle', 'Jag hörde inget – tryck och försök igen'); }
    };

    rec = new SR();
    rec.lang = 'sv-SE'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      heard = Array.from(e.results).map(r => r[0].transcript).join(' ').replace(/\s+/g, ' ');
      $('#status').textContent = '"' + heard + '"';
      clearTimeout(silence);
      silence = setTimeout(finish, 1600);   // 1,6 s tystnad = du är klar
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        handled = true; rec = null; convo = false;
        setOrb('idle', 'Mikrofonen är blockerad – tillåt den för sidan (hänglåset i adressfältet)');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        $('#status').textContent = 'Mikrofonfel: ' + e.error;
      }
    };
    rec.onend = finish;
    stopListening = () => {
      try { rec && rec.stop(); } catch (e) { /* ignore */ }
      setTimeout(finish, 800);               // om webbläsaren inte säger till själv (iOS)
    };
    try { rec.start(); setOrb('listening', 'Lyssnar…'); }
    catch (e) { rec = null; setOrb('idle', 'Kunde inte starta mikrofonen – tryck igen'); }
  }

  function process(text) {
    addMsg('me', text);
    setOrb('thinking', 'Tänker…');
    let res;
    try {
      res = B.handle(text, state, new Date());
      save();
      if (res.ui && res.ui.tab) showTab(res.ui.tab);
      if (res.ui && res.ui.open) openLists.add(res.ui.open);
      render(res.ui && res.ui.flash);
    } catch (err) {
      res = { reply: 'Oj, något gick fel: ' + err.message, expectMore: false };
    }
    addMsg('bot', res.reply);
    speak(res.reply, () => {
      if (res.expectMore && convo) listen();   // fortsätt samtalet: "är det något mer?"
      else convo = false;
    });
  }

  $('#orb').onclick = () => {
    unlockAudio();
    if (stopListening) { stopListening(); return; }         // tryck igen = "jag är klar"
    if (speaking) { convo = false; stopSpeaking(); return; } // tryck medan den pratar = tyst
    convo = true;
    listen();
  };

  $('#textForm').onsubmit = e => {
    e.preventDefault();
    const v = $('#textInput').value.trim();
    if (!v) return;
    $('#textInput').value = '';
    unlockAudio();
    convo = false;
    process(v);
  };

  // ---------- Export ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  function addHour(t) { const [h, m] = t.split(':').map(Number); return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

  $('#icsBtn').onclick = () => {
    const today = B.iso(new Date());
    const evs = state.events.filter(e => e.date >= today);
    if (!evs.length) { alert('Inga kommande händelser att exportera.'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Snygging//SV', 'CALSCALE:GREGORIAN'];
    for (const e of evs) {
      const d = e.date.replace(/-/g, '');
      L.push('BEGIN:VEVENT', `UID:${e.id}@snygging`, `DTSTAMP:${stamp}`);
      if (e.start) {
        const end = e.end || addHour(e.start);
        const endDate = end <= e.start ? B.iso(B.addDays(B.fromIso(e.date), 1)).replace(/-/g, '') : d;
        L.push(`DTSTART:${d}T${e.start.replace(':', '')}00`, `DTEND:${endDate}T${end.replace(':', '')}00`);
      } else {
        L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${B.iso(B.addDays(B.fromIso(e.date), 1)).replace(/-/g, '')}`);
      }
      L.push(`SUMMARY:${icsEsc(e.title)}`);
      if (e.gather) L.push(`DESCRIPTION:${icsEsc('Samling ' + e.gather)}`);
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    download('snygging.ics', L.join('\r\n'), 'text/calendar');
  };

  $('#exportBtn').onclick = () => download('snygging-backup.json', JSON.stringify(state, null, 2), 'application/json');
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { state = JSON.parse(await f.text()); save(); state = load(); render(); alert('Importerat!'); }
    catch (err) { alert('Kunde inte läsa filen.'); }
  };

  // ---------- Synk via GitHub Gist ----------
  // Datan ligger i en hemlig gist på ditt konto. Den nyaste versionen vinner.
  const TOKEN_KEY = 'snygging-token', GIST_KEY = 'snygging-gist', FILE = 'snygging-data.json';
  const Sync = (() => {
    let timer = null, busy = false;
    const token = () => localStorage.getItem(TOKEN_KEY);
    const clock = () => new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const status = t => { $('#syncStatus').textContent = t; };

    async function gh(path, opts = {}) {
      const headers = { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' };
      if (opts.body) headers['Content-Type'] = 'application/json';
      const r = await fetch('https://api.github.com' + path, { ...opts, headers });
      if (r.status === 404 && path.startsWith('/gists/')) localStorage.removeItem(GIST_KEY);
      if (r.status === 401) throw new Error('fel token');
      if (!r.ok) throw new Error('GitHub svarade ' + r.status);
      return r.json();
    }

    async function findGist() {
      const cached = localStorage.getItem(GIST_KEY);
      if (cached) return cached;
      const list = await gh('/gists?per_page=100');
      const g = list.find(x => x.files && x.files[FILE]);
      if (g) localStorage.setItem(GIST_KEY, g.id);
      return g ? g.id : null;
    }

    async function push(force) {
      if (!token()) return;
      if (busy && !force) { schedule(); return; }
      const wasBusy = busy; busy = true;
      try {
        status('Sparar…');
        const files = { [FILE]: { content: JSON.stringify(state) } };
        const id = await findGist();
        if (id) await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files }) });
        else {
          const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Snygging data', public: false, files }) });
          localStorage.setItem(GIST_KEY, g.id);
        }
        status('Synkad ' + clock());
      } catch (e) { status('Synk misslyckades: ' + e.message); }
      finally { if (!wasBusy) busy = false; }
    }

    async function pull() {
      if (!token() || busy) return;
      busy = true;
      try {
        status('Synkar…');
        const id = await findGist();
        if (!id) { await push(true); return; }          // första enheten: skapa gisten
        const f = (await gh('/gists/' + id)).files[FILE];
        const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        const remote = JSON.parse(text);
        const r = remote.updatedAt || 0, l = state.updatedAt || 0;
        if (r > l) { state = remote; persist(); render(); }   // molnet är nyare
        else if (l > r) { await push(true); return; }          // den här enheten är nyare
        status('Synkad ' + clock());
      } catch (e) { status('Synk misslyckades: ' + e.message); }
      finally { busy = false; }
    }

    function schedule() {
      if (!token()) return;
      clearTimeout(timer);
      timer = setTimeout(() => push(), 1500);
    }

    function init() {
      $('#tokenInput').value = token() ? '••••••••' : '';
      status(token() ? 'Kopplad' : 'Inte kopplad');
      $('#tokenSave').onclick = () => {
        const v = $('#tokenInput').value.trim();
        if (!v || v.startsWith('•')) return;
        localStorage.setItem(TOKEN_KEY, v);
        localStorage.removeItem(GIST_KEY);
        $('#tokenInput').value = '••••••••';
        pull();
      };
      $('#syncNow').onclick = () => pull();
      $('#tokenClear').onclick = () => {
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GIST_KEY);
        $('#tokenInput').value = ''; status('Inte kopplad');
      };
      // Hämta när appen öppnas, när du byter tillbaka till den, och varje minut
      document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
      setInterval(() => { if (!document.hidden) pull(); }, 60000);
      pull();
    }
    return { schedule, pull, init };
  })();

  // ---------- Start ----------
  // Låt innehållet aldrig hamna bakom dockan
  new ResizeObserver(() => { document.body.style.paddingBottom = ($('.dock').offsetHeight + 16) + 'px'; }).observe($('.dock'));
  render();
  initVoiceSettings();
  Sync.init();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
