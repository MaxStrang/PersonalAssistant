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
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  save();

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
      const time = e.start ? e.start + (e.end ? '–' + e.end : '') : 'Heldag';
      html += `<div class="ev${e.id === flashId ? ' flash' : ''}">
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
    if (t.dataset.delEv) { state.events = state.events.filter(x => x.id !== t.dataset.delEv); save(); render(); }
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
  const synth = window.speechSynthesis;
  let voices = [];
  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith('sv'));
    const sel = $('#voiceSelect');
    sel.innerHTML = voices.length ? voices.map(v => `<option ${v.name === state.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
      : '<option>Ingen svensk röst hittades</option>';
  }
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  $('#voiceSelect').onchange = e => { state.voice = e.target.value; save(); };
  $('#testVoice').onclick = () => speak('Hej snygging, så här låter jag.');

  function pickVoice() {
    return voices.find(v => v.name === state.voice) ||
      voices.find(v => /alva|klara|google/i.test(v.name)) || voices[0] || null;
  }

  function speak(text, done) {
    let finished = false;
    const end = () => { if (finished) return; finished = true; clearTimeout(guard); setOrb('idle'); done && done(); };
    if (!synth) { end(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE'; u.rate = 1.05; u.pitch = 1.05;
    const v = pickVoice(); if (v) u.voice = v;
    u.onend = end; u.onerror = end;
    const guard = setTimeout(end, 2500 + text.length * 90); // iOS missar ibland onend
    setOrb('speaking', 'Snygging pratar…');
    synth.speak(u);
  }

  // ---------- Röst: lyssna ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, convo = false, unlocked = false;

  function setOrb(mode, text) {
    $('#orb').className = mode === 'idle' ? '' : mode;
    $('#status').textContent = text || (mode === 'idle' ? 'Tryck och prata' : '');
  }

  function listen() {
    if (!SR) { setOrb('idle', 'Röststyrning stöds inte här – testa Chrome eller Safari'); return; }
    let heard = '';
    rec = new SR();
    rec.lang = 'sv-SE'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onresult = e => {
      heard = Array.from(e.results).map(r => r[0].transcript).join('');
      $('#status').textContent = '"' + heard + '"';
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setOrb('idle', 'Tillåt mikrofonen i webbläsarens inställningar');
      convo = false;
    };
    rec.onend = () => {
      rec = null;
      if (heard.trim()) process(heard);
      else { convo = false; if ($('#orb').className === 'listening') setOrb('idle'); }
    };
    try { rec.start(); setOrb('listening', 'Lyssnar…'); }
    catch (err) { setOrb('idle'); }
  }

  function process(text) {
    addMsg('me', text);
    setOrb('thinking', 'Tänker…');
    const res = B.handle(text, state, new Date());
    save();
    if (res.ui && res.ui.tab) showTab(res.ui.tab);
    if (res.ui && res.ui.open) openLists.add(res.ui.open);
    render(res.ui && res.ui.flash);
    addMsg('bot', res.reply);
    speak(res.reply, () => {
      if (res.expectMore && convo) listen(); // fortsätt samtalet: "är det något mer?"
      else convo = false;
    });
  }

  $('#orb').onclick = () => {
    // iOS kräver att talet "låses upp" i ett riktigt tryck
    if (synth && !unlocked) { synth.speak(new SpeechSynthesisUtterance(' ')); unlocked = true; }
    if (rec) { convo = false; rec.stop(); return; }
    if (synth && synth.speaking) { convo = false; synth.cancel(); setOrb('idle'); return; }
    convo = true;
    listen();
  };

  $('#textForm').onsubmit = e => {
    e.preventDefault();
    const v = $('#textInput').value.trim();
    if (!v) return;
    $('#textInput').value = '';
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

  // ---------- Start ----------
  // Låt innehållet aldrig hamna bakom dockan
  new ResizeObserver(() => { document.body.style.paddingBottom = ($('.dock').offsetHeight + 16) + 'px'; }).observe($('.dock'));
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
