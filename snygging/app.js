(() => {
  'use strict';
  const B = window.Brain;
  const KEY = 'snygging-v1';
  const APP_VERSION = 10;   // höj vid varje ändring – syns under inställningar

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
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

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

  // ---------- Vy-läge ----------
  let tab = 'cal';
  const now0 = new Date();
  let viewMonth = new Date(now0.getFullYear(), now0.getMonth(), 1);
  let selDate = B.iso(now0);
  let editingId = null;
  const openLists = new Set();

  function showTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
    document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  }
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#settingsBtn').onclick = () => showTab(tab === 'settings' ? 'cal' : 'settings');

  function goToDate(dIso) {
    const d = B.fromIso(dIso);
    selDate = dIso;
    viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  }

  // ---------- Rendering ----------
  const evsOn = d => state.events.filter(e => e.date === d).sort(B.sortEv);
  const timeText = e => e.start ? e.start + (e.end ? '–' + e.end : '') : 'Heldag';

  function renderHero() {
    const now = new Date();
    $('#heroDay').textContent = B.cap(B.DAYS[now.getDay()]);
    $('#heroDate').textContent = `${now.getDate()} ${B.MONTHS[now.getMonth()]}`;
    const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = B.iso(now);
    const next = state.events
      .filter(e => e.date > today || (e.date === today && (!e.start || (e.end || e.start) >= nowHm)))
      .sort(B.sortEv)[0];
    $('#heroNext').innerHTML = next
      ? `Härnäst: <b>${esc(next.title)}</b> ${esc(B.sayDate(next.date, now))}${next.start ? ' ' + next.start : ''}${next.gather ? `, samling ${next.gather}` : ''}`
      : 'Inget inplanerat. Tryck på knappen och säg vad du ska göra.';
  }

  function renderCal(flashId) {
    const now = new Date(), today = B.iso(now);
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    $('#monthTitle').textContent = `${B.MONTHS[m]} ${y === now.getFullYear() ? '' : y}`.trim();

    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;                 // måndag först
    const days = new Date(y, m + 1, 0).getDate();
    const cells = Math.ceil((offset + days) / 7) * 7;
    let html = '';
    for (let i = 0; i < cells; i++) {
      const d = new Date(y, m, 1 - offset + i), di = B.iso(d);
      const evs = evsOn(di);
      const cls = ['day', d.getMonth() !== m && 'out', di === today && 'today', di === selDate && 'sel'].filter(Boolean).join(' ');
      const chips = evs.slice(0, 3).map(e => `<i title="${esc(timeText(e) + ' ' + e.title)}">${esc(e.title)}</i>`).join('')
        + (evs.length > 3 ? `<i class="more">+${evs.length - 3}</i>` : '');
      const label = `${d.getDate()} ${B.MONTHS[d.getMonth()]}${evs.length ? `, ${evs.length} aktivitet${evs.length > 1 ? 'er' : ''}` : ''}`;
      html += `<button class="${cls}" data-day="${di}" aria-label="${label}"><span class="n">${d.getDate()}</span><span class="evs">${chips}</span></button>`;
    }
    $('#grid').innerHTML = html;

    // Vald dag
    const sel = B.fromIso(selDate);
    const rel = B.sayDate(selDate, now);
    $('#dayTitle').textContent = rel === 'idag' || rel === 'imorgon'
      ? `${rel}, ${sel.getDate()} ${B.MONTHS[sel.getMonth()]}` : rel;
    const list = evsOn(selDate);
    $('#dayList').innerHTML = list.length ? list.map(e => evHtml(e, flashId)).join('')
      : `<p class="empty">Inget inplanerat. Säg till exempel "lägg till padel ${rel === 'idag' ? 'idag' : B.DAYS[sel.getDay()]} kl 18".</p>`;

    // Kommande efter vald dag
    const up = state.events.filter(e => e.date > selDate && e.date >= today).sort(B.sortEv).slice(0, 5);
    $('#upcoming').innerHTML = up.length
      ? `<p class="upcoming-title">Sedan</p>` + up.map(e => evHtml(e, flashId, true)).join('') : '';
  }

  function evHtml(e, flashId, withDate) {
    if (e.id === editingId) {
      return `<form class="ev-edit" data-edit-ev="${e.id}">
        <input name="title" value="${esc(e.title)}" aria-label="Titel">
        <div class="two">
          <label>Dag<input type="date" name="date" value="${e.date}"></label>
          <label>Samling<input type="time" name="gather" value="${e.gather || ''}"></label>
          <label>Start<input type="time" name="start" value="${e.start || ''}"></label>
          <label>Slut<input type="time" name="end" value="${e.end || ''}"></label>
        </div>
        <div class="btn-row"><button>Spara</button><button type="button" class="ghost" data-cancel-edit>Avbryt</button></div>
      </form>`;
    }
    const when = withDate ? `<span class="when">${esc(B.cap(B.sayDate(e.date, new Date())))}</span>` : '';
    return `<div class="ev${e.id === flashId ? ' flash' : ''}" data-open-ev="${e.id}">
      <div class="time">${timeText(e)}</div>
      <div>${when}<div class="title">${esc(e.title)}</div>${e.gather ? `<span class="gather">Samling ${e.gather}</span>` : ''}</div>
      <button class="del" data-del-ev="${e.id}" aria-label="Ta bort ${esc(e.title)}">×</button></div>`;
  }

  function renderLists() {
    $('#lists').innerHTML = state.checklists.map(c => {
      const done = c.items.filter(i => i.done).length, n = c.items.length;
      const isOpen = openLists.has(c.id) || c.id === state.activeList;
      return `<details class="list" data-list="${c.id}" ${isOpen ? 'open' : ''}>
        <summary>
          <div class="name"><strong>${esc(c.name)}</strong><span class="count">${n ? `${done} av ${n}` : 'Tom'}</span></div>
          <div class="progress"><span style="width:${n ? (done / n) * 100 : 0}%"></span></div>
        </summary>
        ${c.items.map((it, i) => `<label class="item${it.done ? ' done' : ''}">
            <input type="checkbox" data-l="${c.id}" data-i="${i}" ${it.done ? 'checked' : ''}>
            <span>${esc(it.text)}</span>
            <button class="del" data-del-item="${c.id}:${i}" aria-label="Ta bort ${esc(it.text)}">×</button></label>`).join('')}
        <form class="add-row" data-add-item="${c.id}">
          <input placeholder="Lägg till punkt" autocomplete="off"><button>Lägg till</button></form>
        <div class="list-actions">
          <button class="text-btn" data-reset="${c.id}">Avmarkera alla</button>
          <button class="text-btn danger" data-del-list="${c.id}">Ta bort lista</button>
        </div></details>`;
    }).join('') || '<p class="empty">Inga checklistor än. Säg "kan du skapa en checklista åt mig".</p>';
  }

  function render(flashId) { renderHero(); renderCal(flashId); renderLists(); }

  // ---------- Klick & formulär ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-open-ev]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.month !== undefined) {
      const n = +ds.month;
      if (n === 0) goToDate(B.iso(new Date()));
      else viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + n, 1);
      renderCal(); return;
    }
    if (ds.day) { selDate = ds.day; editingId = null; renderCal(); return; }
    if (ds.delEv) {
      e.stopPropagation();
      const ev = state.events.find(x => x.id === ds.delEv);
      if (ev && confirm(`Ta bort ${ev.title}?`)) { state.events = state.events.filter(x => x.id !== ds.delEv); save(); render(); }
      return;
    }
    if (ds.cancelEdit !== undefined) { editingId = null; renderCal(); return; }
    if (ds.openEv) { editingId = ds.openEv; renderCal(); const f = $('[data-edit-ev] input'); f && f.focus(); return; }
    if (ds.delItem) { e.preventDefault(); const [l, i] = ds.delItem.split(':'); state.checklists.find(c => c.id === l).items.splice(+i, 1); save(); render(); return; }
    if (ds.reset) { state.checklists.find(c => c.id === ds.reset).items.forEach(i => i.done = false); save(); render(); return; }
    if (ds.delList) {
      const c = state.checklists.find(x => x.id === ds.delList);
      if (c && confirm(`Ta bort listan ${c.name}?`)) { state.checklists = state.checklists.filter(x => x.id !== ds.delList); save(); render(); }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.l) {
      state.checklists.find(c => c.id === t.dataset.l).items[+t.dataset.i].done = t.checked;
      state.activeList = t.dataset.l; save(); renderLists();
    }
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
        save(); goToDate(ev.date);
      }
      editingId = null; render(ev && ev.id);
    } else if (f.dataset.addItem) {
      e.preventDefault();
      const inp = f.querySelector('input'), v = inp.value.trim();
      if (v) { state.checklists.find(c => c.id === f.dataset.addItem).items.push({ text: B.cap(v), done: false }); openLists.add(f.dataset.addItem); save(); render(); }
      const again = $(`[data-add-item="${f.dataset.addItem}"] input`); again && again.focus();
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
    if (who === 'me') chat.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'msg ' + who; p.textContent = text;
    chat.appendChild(p);
    clearTimeout(addMsg.t);
    addMsg.t = setTimeout(() => { chat.innerHTML = ''; }, 20000);
  }

  // ---------- Inställningar för Azure (röst + taligenkänning) ----------
  const TTS_KEY = 'snygging-tts';
  const cfg = () => { try { return JSON.parse(localStorage.getItem(TTS_KEY)) || {}; } catch (e) { return {}; } };
  const azureReady = () => !!cfg().key;
  const region = () => cfg().region || 'swedencentral';

  // ---------- Röst: tal ut ----------
  const synth = window.speechSynthesis;
  const player = new Audio();
  player.setAttribute('playsinline', '');
  let voices = [], speaking = false, stopCurrent = null;

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
      u.lang = 'sv-SE';
      const v = pickVoice(); if (v) u.voice = v;
      const guard = setTimeout(resolve, 2500 + text.length * 90); // iOS missar ibland onend
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      stopCurrent = () => { synth.cancel(); resolve(); };
      synth.speak(u);
    });
  }

  async function azureSpeak(text) {
    const c = cfg();
    const xml = text.replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="sv-SE"><voice name="${c.voice || 'sv-SE-SofieNeural'}"><prosody rate="+4%">${xml}</prosody></voice></speak>`;
    const r = await fetch(`https://${region()}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': c.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
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
    setTalk('speaking');
    try {
      if (cfg().engine === 'azure' && azureReady()) await azureSpeak(text);
      else await browserSpeak(text);
    } catch (err) {
      errMsg = `Azure-rösten svarar inte (${err.message}). Kolla nyckel och region under inställningar.`;
      await browserSpeak(text);
    }
    const wasStopped = !speaking;
    speaking = false; stopCurrent = null;
    setTalk('idle', errMsg);
    if (!wasStopped && done) done();
  }
  function stopSpeaking() { speaking = false; if (stopCurrent) stopCurrent(); setTalk('idle'); }

  // iPhone kräver att ljud "låses upp" i ett riktigt tryck
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return; unlocked = true;
    if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); }
    player.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    player.play().catch(() => {});
  }

  // ---------- Pratknappen ----------
  const LABELS = { reply: 'Tryck för att svara', idle: 'Prata med Snygging', listening: 'Lyssnar – tryck när du är klar', thinking: 'Tänker…', speaking: 'Pratar – tryck för att tysta' };
  function setTalk(mode, status) {
    $('#talk').className = 'talk' + (mode === 'idle' || mode === 'reply' ? '' : ' ' + mode);
    $('#talkLabel').textContent = LABELS[mode];
    $('#status').textContent = status || '';
    if (mode !== 'listening') setBars(null);
  }
  function setBars(level) {
    const bars = document.querySelectorAll('.bars i');
    $('#talk').classList.toggle('live', level != null);
    bars.forEach((b, i) => { b.style.height = level == null ? '' : Math.max(4, Math.min(22, 4 + level * (18 + (i % 3) * 6))) + 'px'; });
  }

  // ---------- Felhjälp för mikrofonen ----------
  function micHelp(code) {
    switch (code) {
      case 'not-allowed':
        return isIOS ? 'Mikrofonen är nekad. Öppna Inställningar → Appar → Safari → Mikrofon och välj Fråga eller Tillåt.'
          : /android/i.test(navigator.userAgent) ? 'Mikrofonen är nekad. Tillåt den för sidan och för Chrome i Androids inställningar (Appar → Chrome → Behörigheter).'
            : 'Mikrofonen är nekad. Klicka på ikonen till vänster om adressen, tillåt mikrofonen och ladda om sidan.';
      case 'service-not-allowed':
        return isIOS ? 'iPhone stänger av webbläsarens taligenkänning här. Välj Tangentbordets diktering under inställningar.'
          : 'Webbläsaren tillåter inte taligenkänning här. Använd Chrome eller Edge.';
      case 'network': return 'Webbläsaren når inte sin taltjänst. Använd Chrome eller Edge.';
      case 'audio-capture': return 'Ingen mikrofon hittades. Kontrollera att en mikrofon är inkopplad och vald.';
      case 'language-not-supported': return 'Webbläsaren saknar svensk taligenkänning. Använd Chrome eller Edge.';
      default: return 'Mikrofonen fungerar inte (' + code + ').';
    }
  }

  // ---------- Lyssna: två motorer ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let convo = false, stopListening = null, abortListening = null, srBroken = false;
  let sessionAuto = false, sessionHeard = false;

  const DICT_KEY = 'snygging-use-dictation';
  function useAzureStt() {
    const mode = cfg().stt || 'auto';
    if (mode === 'azure') return azureReady();
    if (mode !== 'auto') return false;
    return azureReady() && (isIOS || !SR || srBroken);
  }
  // Tangentbordets diktering: Apples egen, funkar alltid på iPhone
  function useDictation() {
    const mode = cfg().stt || 'auto';
    if (mode === 'dictation') return true;
    if (mode !== 'auto' || useAzureStt()) return false;
    return isIOS && (!SR || localStorage.getItem(DICT_KEY) === '1');
  }

  let dictating = false, dictTimer = null;
  function startDictation() {
    const f = $('#textForm'), inp = $('#textInput');
    f.hidden = false; dictating = true;
    inp.value = '';
    inp.placeholder = 'Tryck på mikrofonen på tangentbordet';
    inp.focus();                               // måste ske direkt i trycket, annars öppnas inte tangentbordet
    setTalk('idle', 'Tryck på mikrofonen nere till höger på tangentbordet och prata. Jag skickar när du tystnar.');
  }
  $('#textInput').addEventListener('input', () => {
    if (!dictating) return;
    clearTimeout(dictTimer);
    if (!$('#textInput').value.trim()) return;
    dictTimer = setTimeout(() => $('#textForm').requestSubmit(), 1800);   // 1,8 s utan nya ord = klar
  });
  $('#textInput').addEventListener('blur', () => { setTimeout(() => { if (!$('#textInput').value.trim()) dictating = false; }, 300); });

  function listen(auto = false) {
    sessionAuto = auto; sessionHeard = false;
    if (useAzureStt()) return listenAzure();
    if (!SR) {
      setTalk('idle', 'Den här webbläsaren saknar taligenkänning. Använd Chrome eller Edge, eller skriv i stället.');
      return;
    }
    listenBrowser();
  }

  // Webbläsarens taligenkänning (Chrome, Edge, Safari på Mac)
  function listenBrowser() {
    let heard = '', handled = false, silence = null, lastErr = null;
    let rec = new SR();
    abortListening = () => {
      handled = true; clearTimeout(silence); stopListening = null; abortListening = null;
      try { rec && rec.abort(); } catch (e) { /* */ }
      rec = null;
    };
    const finish = () => {
      if (handled) return;
      handled = true; clearTimeout(silence); stopListening = null; abortListening = null;
      try { rec && rec.abort(); } catch (e) { /* redan stoppad */ }
      rec = null;
      if (heard.trim()) return process(heard.trim());
      convo = false;
      if (lastErr === 'service-not-allowed' || lastErr === 'network') srBroken = true;
      if (isIOS && (lastErr === 'service-not-allowed' || lastErr === 'not-allowed') && !azureReady()) {
        localStorage.setItem(DICT_KEY, '1');
        return setTalk('idle', 'Safari tillåter inte röststyrning här. Jag använder tangentbordets diktering i stället – tryck på knappen igen.');
      }
      const fallback = srBroken && azureReady() ? ' Jag byter till Azure – tryck igen.' : '';
      setTalk('idle', lastErr && lastErr !== 'no-speech' && lastErr !== 'aborted' ? micHelp(lastErr) + fallback : 'Jag hörde inget. Tryck och försök igen.');
    };
    rec.lang = 'sv-SE'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      heard = Array.from(e.results).map(r => r[0].transcript).join(' ').replace(/\s+/g, ' ');
      sessionHeard = true;
      $('#status').textContent = '”' + heard + '”';
      clearTimeout(silence);
      silence = setTimeout(finish, 1600);   // 1,6 s tystnad = du är klar
    };
    rec.onerror = e => { lastErr = e.error; };
    rec.onend = finish;
    stopListening = () => { try { rec && rec.stop(); } catch (e) { /* */ } setTimeout(finish, 800); };
    try { rec.start(); setTalk('listening'); }
    catch (e) { stopListening = null; setTalk('idle', 'Mikrofonen gick inte att starta: ' + e.message); }
  }

  // Azure-taligenkänning: spelar in själv (funkar på iPhone, även från hemskärmen)
  let mic = null; // { stream, ctx, src, proc }
  async function openMic() {
    if (mic) return mic;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    src.connect(proc); proc.connect(ctx.destination);
    mic = { stream, ctx, src, proc };
    return mic;
  }
  function closeMic() {
    if (!mic) return;
    try { mic.proc.disconnect(); mic.src.disconnect(); mic.stream.getTracks().forEach(t => t.stop()); mic.ctx.close(); } catch (e) { /* */ }
    mic = null;
  }

  async function listenAzure() {
    let m;
    try { m = await openMic(); await m.ctx.resume(); }
    catch (e) {
      convo = false; closeMic();
      setTalk('idle', e.name === 'NotAllowedError' ? micHelp('not-allowed') : e.name === 'NotFoundError' ? micHelp('audio-capture') : 'Mikrofonen gick inte att starta: ' + e.message);
      return;
    }
    const chunks = [], t0 = performance.now();
    let spoke = false, lastLoud = t0, done = false, noise = 0.01;
    setTalk('listening');

    const finish = async () => {
      if (done) return; done = true;
      m.proc.onaudioprocess = null; stopListening = null;
      if (!spoke) { convo = false; closeMic(); setTalk('idle', 'Jag hörde inget. Tryck och försök igen.'); return; }
      setTalk('thinking', 'Tolkar…');
      try {
        const text = await azureRecognize(encodeWav(chunks, m.ctx.sampleRate));
        if (text) process(text);
        else { convo = false; closeMic(); setTalk('idle', 'Jag uppfattade inte vad du sa. Försök igen.'); }
      } catch (e) {
        convo = false; closeMic();
        setTalk('idle', `Azure-taligenkänningen svarar inte (${e.message}). Kolla nyckel och region.`);
      }
    };
    stopListening = finish;

    m.proc.onaudioprocess = ev => {
      const d = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length), t = performance.now();
      if (!spoke && t - t0 < 400) noise = Math.max(noise, rms);          // mät bakgrundsljud först
      if (rms > Math.max(0.02, noise * 2.2)) { spoke = true; lastLoud = t; }
      setBars(Math.min(1, rms * 12));
      if ((spoke && t - lastLoud > 1400) || t - t0 > 15000 || (!spoke && t - t0 > 7000)) finish();
    };
  }

  function encodeWav(chunks, rate) {
    // slå ihop, sampla ner till 16 kHz, gör 16-bitars WAV
    const len = chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(len);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    const ratio = rate / 16000, outLen = Math.floor(len / ratio), pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += all[j];
      const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
    const str = (p, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 16000, true);
    dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }

  async function azureRecognize(wav) {
    const r = await fetch(`https://${region()}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=sv-SE&format=simple`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': cfg().key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' },
      body: wav,
    });
    if (!r.ok) throw new Error('svarade ' + r.status);
    const j = await r.json();
    return j.RecognitionStatus === 'Success' ? (j.DisplayText || '').trim() : '';
  }

  // ---------- Från tal till svar ----------
  function process(text) {
    addMsg('me', text);
    setTalk('thinking');
    let res;
    try {
      res = B.handle(text, state, new Date());
      save();
      if (res.ui && res.ui.tab) showTab(res.ui.tab);
      if (res.ui && res.ui.open) openLists.add(res.ui.open);
      if (res.ui && res.ui.flash) { const ev = state.events.find(e => e.id === res.ui.flash); if (ev) goToDate(ev.date); }
      render(res.ui && res.ui.flash);
    } catch (err) {
      res = { reply: 'Något gick fel: ' + err.message, expectMore: false };
    }
    addMsg('bot', res.reply);
    speak(res.reply, () => {
      if (res.expectMore && convo) {
        // iPhone låter bara mikrofonen starta direkt efter ett tryck → vänta på användaren
        if (isIOS && !useAzureStt()) setTalk('reply');
        else listen(true);                     // fortsätt samtalet: "är det något mer?"
      } else { convo = false; closeMic(); }
    });
  }

  $('#talk').onclick = () => {
    unlockAudio();
    if (stopListening && sessionAuto && !sessionHeard && abortListening) {
      abortListening(); convo = true; listen(); return;                  // automatisk lyssning fastnade → starta om nu
    }
    if (stopListening) { stopListening(); return; }                     // tryck igen = jag är klar
    if (speaking) { convo = false; closeMic(); stopSpeaking(); return; } // tryck medan den pratar = tyst
    if (useDictation()) { convo = false; startDictation(); return; }
    convo = true;
    listen();
  };
  $('#kbBtn').onclick = () => {
    const f = $('#textForm'); f.hidden = !f.hidden;
    if (!f.hidden) $('#textInput').focus();
  };
  $('#textForm').onsubmit = e => {
    e.preventDefault();
    const v = $('#textInput').value.trim();
    if (!v) return;
    clearTimeout(dictTimer);
    const wasDictating = dictating;
    dictating = false;
    $('#textInput').value = '';
    $('#textInput').placeholder = 'Skriv till Snygging';
    if (wasDictating) $('#textInput').blur();   // stäng tangentbordet så svaret syns
    unlockAudio(); convo = false;
    process(v);
  };

  // ---------- Inställningar ----------
  function initSettings() {
    const c = cfg();
    $('#engineSelect').value = c.engine || 'browser';
    $('#sttSelect').value = c.stt || 'auto';
    $('#azureKey').value = c.key ? '••••••••' : '';
    $('#azureRegion').value = c.region || 'swedencentral';
    $('#azureVoice').value = c.voice || 'sv-SE-SofieNeural';
    const store = () => {
      const k = $('#azureKey').value.trim();
      localStorage.setItem(TTS_KEY, JSON.stringify({
        engine: $('#engineSelect').value, stt: $('#sttSelect').value,
        key: k.startsWith('•') ? cfg().key : k,
        region: $('#azureRegion').value.trim() || 'swedencentral',
        voice: $('#azureVoice').value,
      }));
    };
    ['#engineSelect', '#sttSelect', '#azureKey', '#azureRegion', '#azureVoice'].forEach(s => $(s).onchange = store);
    const toggleAzure = () => { $('#azureBox').hidden = !($('#engineSelect').value === 'azure' || $('#sttSelect').value === 'azure'); };
    toggleAzure();
    $('#engineSelect').addEventListener('change', toggleAzure);
    $('#sttSelect').addEventListener('change', toggleAzure);
    $('#sttSelect').addEventListener('change', () => { if ($('#sttSelect').value === 'browser') localStorage.removeItem(DICT_KEY); });
    $('#voiceSelect').onchange = e => { state.voice = e.target.value; save(); };
    $('#testVoice').onclick = () => { unlockAudio(); speak('Hej snygging! Så här låter jag. Vad vill du göra idag?'); };
    $('#testMic').onclick = testMic;
  }

  async function testMic() {
    const out = $('#micTest'), lines = [];
    lines.push('Webbläsarens taligenkänning: ' + (SR ? 'finns' : 'saknas'));
    lines.push('Azure-nyckel: ' + (azureReady() ? 'inlagd' : 'saknas'));
    lines.push('Används nu: ' + (useDictation() ? 'tangentbordets diktering' : useAzureStt() ? 'Azure' : 'webbläsarens taligenkänning'));
    if (isIOS) lines.push('Öppnad från hemskärmen: ' + (standalone ? 'ja' : 'nej'));
    out.textContent = lines.join('\n') + '\nFrågar efter mikrofonen…';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      lines.push('Mikrofonen: tillåten och fungerar ✓');
    } catch (e) {
      lines.push('Mikrofonen: ' + ({ NotAllowedError: micHelp('not-allowed'), NotFoundError: micHelp('audio-capture') }[e.name] || e.name));
    }
    if (azureReady()) {
      try {
        const r = await fetch(`https://${region()}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': cfg().key } });
        lines.push('Azure-nyckeln: ' + (r.ok ? 'fungerar ✓' : `fungerar inte (svarade ${r.status})`));
      } catch (e) { lines.push('Azure-nyckeln: gick inte att nå Azure (' + e.message + ')'); }
    }
    out.textContent = lines.join('\n');
  }

  // ---------- Export ----------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const addHour = t => { const [h, m] = t.split(':').map(Number); return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
  $('#icsBtn').onclick = () => {
    const today = B.iso(new Date());
    const evs = state.events.filter(e => e.date >= today);
    if (!evs.length) { alert('Det finns inga kommande aktiviteter att lägga in.'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Snygging//SV', 'CALSCALE:GREGORIAN'];
    for (const e of evs) {
      const d = e.date.replace(/-/g, ''), next = B.iso(B.addDays(B.fromIso(e.date), 1)).replace(/-/g, '');
      L.push('BEGIN:VEVENT', `UID:${e.id}@snygging`, `DTSTAMP:${stamp}`);
      if (e.start) {
        const end = e.end || addHour(e.start);
        L.push(`DTSTART:${d}T${e.start.replace(':', '')}00`, `DTEND:${end <= e.start ? next : d}T${end.replace(':', '')}00`);
      } else L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
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
    try { state = JSON.parse(await f.text()); save(); state = load(); render(); alert('Importerat.'); }
    catch (err) { alert('Filen gick inte att läsa. Välj en fil som exporterats från Snygging.'); }
  };

  // ---------- Synk via GitHub Gist ----------
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
      const g = (await gh('/gists?per_page=100')).find(x => x.files && x.files[FILE]);
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
        else localStorage.setItem(GIST_KEY, (await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Snygging data', public: false, files }) })).id);
        status('Synkad ' + clock());
      } catch (e) { status('Synken misslyckades: ' + e.message); }
      finally { if (!wasBusy) busy = false; }
    }
    async function pull() {
      if (!token() || busy) return;
      busy = true;
      try {
        status('Synkar…');
        const id = await findGist();
        if (!id) { await push(true); return; }
        const f = (await gh('/gists/' + id)).files[FILE];
        const remote = JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content);
        const r = remote.updatedAt || 0, l = state.updatedAt || 0;
        if (r > l) { state = remote; persist(); render(); }
        else if (l > r) { await push(true); return; }
        status('Synkad ' + clock());
      } catch (e) { status('Synken misslyckades: ' + e.message); }
      finally { busy = false; }
    }
    function schedule() { if (!token()) return; clearTimeout(timer); timer = setTimeout(() => push(), 1500); }
    function init() {
      $('#tokenInput').value = token() ? '••••••••' : '';
      status(token() ? 'Kopplad' : 'Inte kopplad');
      $('#tokenSave').onclick = () => {
        const v = $('#tokenInput').value.trim();
        if (!v || v.startsWith('•')) return;
        localStorage.setItem(TOKEN_KEY, v); localStorage.removeItem(GIST_KEY);
        $('#tokenInput').value = '••••••••'; pull();
      };
      $('#syncNow').onclick = () => pull();
      $('#tokenClear').onclick = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(GIST_KEY); $('#tokenInput').value = ''; status('Inte kopplad'); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { pull(); renderHero(); } });
      setInterval(() => { if (!document.hidden) pull(); }, 60000);
      pull();
    }
    return { schedule, pull, init };
  })();

  // ---------- Start ----------
  new ResizeObserver(() => { document.body.style.paddingBottom = ($('.dock').offsetHeight + 24) + 'px'; }).observe($('.dock'));
  render();
  initSettings();
  Sync.init();
  // ---------- Uppdateringar ----------
  // Ladda om automatiskt när en ny version tagit över, och leta efter nya versioner när appen öppnas igen.
  $('#appVersion').textContent = 'Version ' + APP_VERSION;
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  $('#forceUpdate').onclick = async () => {
    $('#forceUpdate').textContent = 'Uppdaterar…';
    try {
      if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    } catch (e) { /* ladda om ändå */ }
    location.replace(location.pathname + '?v=' + Date.now());   // din data ligger kvar
  };
})();
