/* Snygging – "hjärnan". Tolkar svenska kommandon och uppdaterar state.
   Ren logik utan DOM, så den kan testas med node (node test.js). */
(function (root) {
  'use strict';

  const DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
    'augusti', 'september', 'oktober', 'november', 'december'];

  // \b i JS förstår inte å/ä/ö – därför en egen ordgräns.
  const L = 'a-z0-9åäöéü';
  const WB = `(?:(?<=^|[^${L}])(?=[${L}])|(?<=[${L}])(?=$|[^${L}]))`;
  const rx = (s, f = '') => new RegExp(s.replace(/\\b/g, WB), f);

  const KL = '(?:kl(?:ockan)?\\s*)';
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?';

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const joinList = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' och ' + a[a.length - 1];

  function sayTime(t) { const [h, m] = t.split(':'); return m === '00' ? String(+h) : `${+h}:${m}`; }
  function sayDate(dIso, now) {
    if (dIso === iso(now)) return 'idag';
    if (dIso === iso(addDays(now, 1))) return 'imorgon';
    const d = fromIso(dIso);
    return `${DAYS[d.getDay()]} den ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/,/g, ' , ')
      .replace(/[^a-z0-9åäöéü:.,\-\/ ]+/g, ' ')
      .replace(/\.(?!\d)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function stripWake(t) {
    return t.replace(rx('^(?:(?:hall[åa]|hallå där|hej|hejsan|tja|okej|ok|du)\\s+)?snygg(?:ing|ingen|isen)\\b\\s*'), '').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  }

  // ---------- Datum & tid ----------
  function takeDate(t, now) {
    const simple = [
      [rx('\\b(?:i )?övermorgon\\b'), 2],
      [rx('\\b(?:i ?morgon|imorn|i morn)(?: (?:kväll|morgon|bitti|eftermiddag|förmiddag))?\\b'), 1],
      [rx('\\b(?:i ?dag|i ?kväll|i eftermiddag|i förmiddag|ikväll)\\b'), 0],
    ];
    for (const [re, n] of simple) {
      const m = t.match(re);
      if (m) return { date: iso(addDays(now, n)), text: t.replace(m[0], ' ') };
    }
    let m = t.match(rx(`\\b(?:på |nu på |nästa |kommande )?(${DAYS.join('|')})(?:en|s)?\\b`));
    if (m) {
      let diff = (DAYS.indexOf(m[1]) - now.getDay() + 7) % 7;
      if (diff === 0 && /nästa/.test(m[0])) diff = 7;
      return { date: iso(addDays(now, diff)), text: t.replace(m[0], ' ') };
    }
    for (const mm of t.matchAll(rx('\\b(?:den |på )?(\\d{1,2})(?::?[ae])? ([a-zåäö]{3,})\\b', 'g'))) {
      const w = mm[2];
      const mi = MONTHS.findIndex(mo => mo.startsWith(w) || w.startsWith(mo));
      if (mi < 0) continue;
      let d = new Date(now.getFullYear(), mi, +mm[1]);
      if (iso(d) < iso(now)) d = new Date(now.getFullYear() + 1, mi, +mm[1]);
      return { date: iso(d), text: t.replace(mm[0], ' ') };
    }
    m = t.match(rx('\\b(?:den )?(\\d{1,2})\\/(\\d{1,2})\\b'));
    if (m) {
      let d = new Date(now.getFullYear(), +m[2] - 1, +m[1]);
      if (iso(d) < iso(now)) d = new Date(now.getFullYear() + 1, +m[2] - 1, +m[1]);
      return { date: iso(d), text: t.replace(m[0], ' ') };
    }
    return { date: null, text: t };
  }

  function takeTimes(t, evening) {
    const hm = (h, m) => {
      h = +h; m = m ? +m : 0;
      if (h > 24 || m > 59) return null;
      if (evening && h < 12) h += 12;
      return `${pad(h % 24)}:${pad(m)}`;
    };
    let gather = null, start = null, end = null, m;

    m = t.match(rx(`(?:(?:med|och) )?samling(?:en)?(?: (?:är|blir|sker))?(?: (?:vid|på))? ?${KL}?${T}\\b`));
    if (m) { gather = hm(m[1], m[2]); t = t.replace(m[0], ' '); }

    m = t.match(rx(`\\bmellan ${KL}?${T} och ${KL}?${T}\\b`)) ||
        t.match(rx(`\\b(?:från )?${KL}?${T} ?(?:-|till) ?${KL}?${T}\\b`));
    if (m) { start = hm(m[1], m[2]); end = hm(m[3], m[4]); t = t.replace(m[0], ' '); }
    else {
      m = t.match(rx(`\\b(?:vid |från )?${KL}${T}\\b`)) || t.match(rx('\\b(?:vid )?(\\d{1,2})[:.](\\d{2})\\b'));
      if (m) { start = hm(m[1], m[2]); t = t.replace(m[0], ' '); }
    }
    return { gather, start, end, text: t };
  }

  const STOP = new Set(['på', 'den', 'med', 'och', 'kl', 'klockan', 'i', 'till', 'vid', 'för', 'som',
    'att', 'en', 'ett', 'från', 'mellan', 'min', 'mitt', 'mina', 'in', 'upp']);

  function cleanTitle(t) {
    t = t.replace(/,/g, ' ').replace(rx('\\b(?:kan du|kan ni|skulle du kunna|kan jag få|snälla|tack|är du snäll och|jag vill att du|jag vill|hjälp mig)\\b', 'g'), ' ')
      .replace(rx('\\b(?:lägg(?:a)? (?:till|in)|boka(?: in)?|skapa|planera|skriv(?:a)? (?:in|upp)|notera|sätt(?:a)? upp|påminn mig om)\\b', 'g'), ' ')
      .replace(rx('\\b(?:i|till|på|in i) (?:min |mina )?kalender(?:n)?\\b', 'g'), ' ')
      .replace(/\s+/g, ' ').trim()
      // "att jag har match" → "match"
      .replace(rx('^(?:att |så att |om att |det att )?(?:jag|vi|man|du) (?:har|ska|skall|måste|behöver|borde|vill|kommer att|kommer)(?: (?:gå på|gå till|åka på|åka till|iväg på|på|till|en|ett))?\\s+'), '')
      .replace(rx('^(?:att |det är |det blir |det finns )'), '')
      .replace(rx('\\s+(?:åt mig|för mig|till mig)$'), '');
    const w = t.split(' ').filter(Boolean);
    while (w.length && STOP.has(w[0])) w.shift();
    while (w.length && STOP.has(w[w.length - 1])) w.pop();
    return cap(w.join(' '));
  }

  function sayDateSpoken(dIso, now) {
    const s = sayDate(dIso, now);
    return s === 'imorgon' ? `imorgon ${DAYS[fromIso(dIso).getDay()]}` : s;
  }
  function eventPhrase(e, now, withDate = true) {
    let s = withDate ? `${e.title} ${sayDateSpoken(e.date, now)}` : e.title;
    if (e.start && e.end) s += ` klockan ${sayTime(e.start)} till ${sayTime(e.end)}`;
    else if (e.start) s += ` klockan ${sayTime(e.start)}`;
    if (e.gather) s += `, med samling klockan ${sayTime(e.gather)}`;
    return s;
  }

  const sortEv = (a, b) => (a.date + (a.start || '00:00')).localeCompare(b.date + (b.start || '00:00'));

  // ---------- Fuzzy-matchning (för listor/punkter/händelser) ----------
  const STOPL = new Set([...STOP, 'lista', 'listan', 'checklista', 'checklistan', 'listor', 'det', 'de',
    'alla', 'av', 'ur', 'kalendern', 'kalender']);
  function stems(s) {
    return norm(s).replace(/[:.,\-\/]/g, ' ').split(' ')
      .filter(w => w && !STOPL.has(w))
      .map(w => w.replace(/listan$/, 'lista').slice(0, 5));
  }
  function score(q, name) {
    const a = stems(q), b = stems(name);
    let s = 0;
    for (const x of a) if (b.some(y => y === x || (x.length >= 4 && y.startsWith(x)) || (y.length >= 4 && x.startsWith(y)))) s++;
    return s;
  }
  function best(arr, q, key, prefer) {
    let top = null, ts = 0;
    for (const x of arr) {
      let s = score(q, key(x));
      if (s > 0 && prefer && prefer(x)) s += 0.1;
      if (s > ts) { ts = s; top = x; }
    }
    return ts >= 1 ? top : null;
  }

  // ---------- Följdfrågor ("Vad ska listan heta?") ----------
  let pending = null;
  const PENDING_MS = 3 * 60 * 1000;

  function createList(state, name, items) {
    const list = { id: uid(), name: cap(name.trim()), items: items.map(x => ({ text: cap(x), done: false })) };
    state.checklists.push(list); state.activeList = list.id;
    if (items.length)
      return { reply: `Klart! Jag har skapat ${list.name} med ${joinList(items)}. Något mer?`, expectMore: true, ui: { tab: 'lists', open: list.id } };
    pending = { type: 'list-items', listId: list.id, at: Date.now() };
    return { reply: `Snyggt, ${list.name} är skapad! Vad ska den innehålla?`, expectMore: true, ui: { tab: 'lists', open: list.id } };
  }

  function handlePending(p, t, state, now) {
    const cancel = rx('^(?:avbryt|glöm det|strunta i det|skit samma|nej|nä)\\b').test(t);
    if (p.type === 'list-name') {
      if (cancel) return { reply: 'Okej, jag struntar i det. Något annat?', expectMore: true };
      const name = t.replace(rx('^(?:den ska heta|den heter|kalla den|döp den till|namnet är|den kan heta|vi kan kalla den)\\s+'), '');
      const mm = name.match(rx('^(.+?)\\s+(?:med|och den ska innehålla|som innehåller)\\s+(.+)$'));
      return mm ? createList(state, mm[1], splitItems(mm[2])) : createList(state, name, []);
    }
    if (p.type === 'list-items') {
      const list = state.checklists.find(c => c.id === p.listId);
      if (!list) return null;
      if (cancel || rx('^(?:inget|ingenting|det var allt|inget mer|ingen)\\b').test(t))
        return { reply: `Okej, ${list.name} är tom så länge. Säg "lägg till" när du vill fylla på. Något mer?`, expectMore: true };
      const items = splitItems(t.replace(rx('^(?:den ska innehålla|lägg till|lägg in|skriv upp|det ska vara)\\s+'), ''));
      items.forEach(x => list.items.push({ text: cap(x), done: false }));
      return { reply: `Klart! ${list.name} innehåller nu ${joinList(list.items.map(i => i.text.toLowerCase()))}. Något mer?`, expectMore: true, ui: { tab: 'lists', open: list.id } };
    }
    if (p.type === 'confirm-delete-list') {
      const list = state.checklists.find(c => c.id === p.listId);
      if (list && rx('^(?:ja|japp|jajamän|absolut|gör det|ta bort|radera|visst|okej|ok)\\b').test(t)) {
        state.checklists = state.checklists.filter(c => c.id !== list.id);
        return { reply: `Okej, listan ${list.name} är borttagen. Något mer?`, expectMore: true, ui: { tab: 'lists' } };
      }
      return { reply: 'Då låter jag den vara kvar. Något annat?', expectMore: true };
    }
    if (p.type === 'event-title') {
      if (cancel) return { reply: 'Okej, jag lägger inte in något. Något annat?', expectMore: true };
      return handleAdd(p.text + ' ' + t, state, now);
    }
    return null;
  }

  // ---------- Checklistor ----------
  function findList(state, q) {
    if (!q || !stems(q).length) return state.checklists.find(c => c.id === state.activeList) || null;
    return best(state.checklists, q, c => c.name);
  }
  function remaining(list) {
    const left = list.items.filter(i => !i.done).map(i => i.text);
    return left.length ? `Kvar på ${list.name}: ${joinList(left)}.` : `Allt på ${list.name} är klart, snyggt jobbat!`;
  }
  const listNames = s => joinList(s.checklists.map(c => c.name));
  const splitItems = s => s.split(rx(',|\\boch\\b')).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

  function handleList(t, state) {
    let m;
    const ui = list => ({ tab: 'lists', open: list && list.id });

    // Ta bort hel lista – frågar först
    m = t.match(rx('^(?:ta bort|radera)\\s+(?:hela\\s+)?(?:check)?listan\\s+(.+)$')) || t.match(rx('^(?:ta bort|radera)\\s+(\\S*listan)$'));
    if (m) {
      const list = findList(state, m[1]);
      if (!list) return { reply: `Jag hittar ingen sådan lista. Du har ${listNames(state)}.`, expectMore: true };
      pending = { type: 'confirm-delete-list', listId: list.id, at: Date.now() };
      return { reply: `Vill du verkligen ta bort hela listan ${list.name}?`, expectMore: true, ui: ui(list) };
    }
    // Ta bort punkt: "ta bort mjölk från handlalistan"
    m = t.match(rx('^(?:ta bort|radera|stryk)\\s+(.+?)(?:\\s(?:från|ur|på|i)\\s(\\S*list.*))?$'));
    if (m) {
      const list = findList(state, m[2] || '');
      if (!list) return { reply: `Vilken lista ska jag ta bort det från? Du har ${listNames(state)}.`, expectMore: true };
      const gone = [], miss = [];
      for (const it of splitItems(m[1])) {
        const hit = best(list.items, it, i => i.text);
        if (hit) { list.items.splice(list.items.indexOf(hit), 1); gone.push(hit.text.toLowerCase()); } else miss.push(it);
      }
      state.activeList = list.id;
      let reply = gone.length ? `Klart, jag har tagit bort ${joinList(gone)} från ${list.name}. ` : '';
      if (miss.length) reply += `${cap(joinList(miss))} fanns inte på ${list.name}. `;
      return { reply: reply + 'Något mer?', expectMore: true, ui: ui(list) };
    }

    // Byt namn på punkt: "ändra mjölk till havremjölk på handlalistan"
    m = t.match(rx('^(?:ändra|byt ut|byt)\\s+(.+?)\\s+(?:till|mot)\\s+(.+?)(?:\\s(?:på|i)\\s(\\S*list.*))?$'));
    if (m) {
      const list = findList(state, m[3] || '');
      const hit = list && best(list.items, m[1], i => i.text);
      if (!hit) return { reply: 'Jag hittade inte den punkten. Vilken lista menar du?', expectMore: true };
      const old = hit.text; hit.text = cap(m[2].trim()); state.activeList = list.id;
      return { reply: `Klart, ${old} heter nu ${hit.text} på ${list.name}. Något mer?`, expectMore: true, ui: ui(list) };
    }

    // Skapa ny lista – frågar efter namn/innehåll om det saknas
    m = t.match(rx('\\b(?:skapa|gör|göra|fixa|starta|lägg till|lägga till)\\s+(?:en\\s+)?(?:ny\\s+)?(?:check)?listan?\\b(.*)$'));
    if (m) {
      let rest = m[1].replace(rx('\\b(?:åt mig|till mig|för mig|åt oss|snälla|tack|också|nu)\\b', 'g'), ' ').replace(/\s+/g, ' ').trim();
      rest = rest.replace(rx('^(?:som heter|som ska heta|med namnet|med titeln|kallad|som)\\s+'), '').trim();
      let name = rest, items = [];
      const mm = rest.match(rx('^(.+?)\\s+(?:med|som innehåller|innehållande)\\s+(.+)$'));
      if (mm) { name = mm[1]; items = splitItems(mm[2]); }
      if (!name) {
        pending = { type: 'list-name', at: Date.now() };
        return { reply: 'Javisst! Vad ska listan heta?', expectMore: true, ui: { tab: 'lists' } };
      }
      return createList(state, name, items);
    }

    // Lägg till punkt på lista
    m = t.match(rx('\\b(?:lägg(?:a)? (?:till|in)|skriv(?:a)? upp|sätt(?:a)? upp)\\s+(.+?)\\s(?:på|i|till)\\s(\\S*list.*)$'));
    if (m) {
      const list = findList(state, m[2]);
      if (!list) return { reply: `Jag hittar ingen sådan lista. Du har ${listNames(state)}.`, expectMore: true };
      const items = splitItems(m[1]);
      items.forEach(x => list.items.push({ text: cap(x), done: false }));
      state.activeList = list.id;
      return { reply: `Klart, jag har lagt till ${joinList(items)} på ${list.name}. Något mer?`, expectMore: true, ui: ui(list) };
    }

    // Bocka av
    m = t.match(rx('\\b(?:bocka av|bocka för|bocka|kryssa av|kryssa för|kryssa|markera|jag har (?:packat|tagit|gjort|fixat|köpt)|klar med)\\s+(.+)$'));
    if (m) {
      let rest = m[1], listPart = '';
      const sp = rest.match(rx('^(.*?)\\s(?:på|i|från|ur)\\s(\\S*list.*)$'));
      if (sp) { rest = sp[1]; listPart = sp[2]; }
      let list = listPart ? findList(state, listPart) : findList(state, '');
      const items = splitItems(rest);
      if (!listPart && (!list || !best(list.items, items[0] || '', i => i.text))) {
        // Ingen lista angiven och punkten finns inte i aktiv lista: leta i alla listor
        list = null;
        for (const c of state.checklists) if (best(c.items, items[0] || '', i => i.text)) { list = c; break; }
      }
      if (!list) return { reply: `Vilken lista menar du snygging? Du har ${listNames(state)}.`, expectMore: true };
      state.activeList = list.id;
      if (/^(?:allt|alla|allting|hela listan)$/.test(rest.trim())) {
        list.items.forEach(i => { i.done = true; });
        return { reply: `Allt på ${list.name} är avbockat. Snyggt jobbat! Något mer?`, expectMore: true, ui: ui(list) };
      }
      const done = [], miss = [];
      for (const it of items) {
        const hit = best(list.items, it, i => i.text, i => !i.done);
        if (hit) { hit.done = true; done.push(hit.text.toLowerCase()); } else miss.push(it);
      }
      let reply = done.length ? `Klart snygging! Jag har bockat av ${joinList(done)}. ` : '';
      if (miss.length) reply += `Jag hittade inte ${joinList(miss)} på ${list.name}. `;
      reply += remaining(list) + ' Något mer?';
      return { reply, expectMore: true, ui: ui(list) };
    }

    // Nollställ
    m = t.match(rx('\\b(?:nollställ|återställ|börja om(?: med| på)?|rensa)\\s+(.+)$'));
    if (m) {
      const list = findList(state, m[1]);
      if (!list) return { reply: `Vilken lista vill du nollställa? Du har ${listNames(state)}.`, expectMore: true };
      list.items.forEach(i => { i.done = false; }); state.activeList = list.id;
      return { reply: `${list.name} är nollställd och redo. Något mer?`, expectMore: true, ui: ui(list) };
    }

    // Vad är kvar
    m = t.match(rx('\\bvad (?:är|har jag) kvar(?: att göra)?(?:\\s+(?:på|i)\\s+(.+))?$'));
    if (m) {
      const list = findList(state, m[1] || '');
      if (!list) return { reply: `Vilken lista menar du? Du har ${listNames(state)}.`, expectMore: true };
      state.activeList = list.id;
      return { reply: remaining(list) + ' Något mer?', expectMore: true, ui: ui(list) };
    }

    // Vilka listor
    if (rx('\\bvilka (?:check)?listor\\b').test(t)) {
      return { reply: `Du har ${state.checklists.length} listor: ${listNames(state)}. Vilken vill du köra?`, expectMore: true, ui: { tab: 'lists' } };
    }

    // Visa / öppna
    m = t.match(rx('\\b(?:visa|öppna|kör|starta|ta fram|gå igenom|läs upp|läs)\\s+(.+)$'));
    const list = findList(state, m ? m[1] : t);
    if (list) {
      state.activeList = list.id;
      return { reply: `Här är ${list.name}. ${remaining(list)} Säg till vad jag ska bocka av.`, expectMore: true, ui: ui(list) };
    }
    return { reply: `Jag hittar ingen sådan lista. Du har ${listNames(state)}.`, expectMore: true, ui: { tab: 'lists' } };
  }

  // ---------- Kalender ----------
  function handleQuery(t, state, now) {
    const today = iso(now);
    let evs, when;
    const d = takeDate(t, now);
    if (d.date) {
      evs = state.events.filter(e => e.date === d.date); when = sayDate(d.date, now);
    } else if (rx('\\bveckan\\b').test(t)) {
      const end = iso(addDays(now, 7));
      evs = state.events.filter(e => e.date >= today && e.date < end); when = 'den närmaste veckan';
    } else {
      evs = state.events.filter(e => e.date >= today).sort(sortEv).slice(0, 5); when = null;
    }
    evs.sort(sortEv);
    if (!evs.length) return { reply: when ? `Du har inget inplanerat ${when}. Vill du lägga till något?` : 'Kalendern är tom. Vill du lägga till något?', expectMore: true, ui: { tab: 'cal' } };
    const parts = evs.map(e => eventPhrase(e, now, !d.date));
    const head = when ? `${cap(when)} har du` : 'Härnäst har du';
    return { reply: `${head} ${joinList(parts)}. Något mer?`, expectMore: true, ui: { tab: 'cal' } };
  }

  // Ändra en aktivitet: namn, dag, tid eller samling
  function handleEdit(t, state, now) {
    const today = iso(now);
    let mode = 'auto', m;
    if ((m = t.match(rx('^(?:byt namn på|döp om|ändra (?:titeln|namnet|rubriken) (?:på|för|till))\\s+(.+?)\\s+till\\s+(.+)$')))) mode = 'rename';
    else if ((m = t.match(rx('^(?:ändra|byt|flytta|sätt) (?:samlingen|samlingstiden) (?:på|för|till)\\s+(.+?)\\s+till\\s+(.+)$')))) mode = 'gather';
    else if ((m = t.match(rx('^(?:ändra|byt|flytta) (?:tiden|tid|dagen|datumet) (?:på|för)\\s+(.+?)\\s+till\\s+(.+)$')))) mode = 'time';
    else if ((m = t.match(rx('^(?:flytta|ändra|byt|uppdatera|sätt om)\\s+(.+?)\\s+till\\s+(.+)$')))) mode = /^flytta/.test(t) ? 'time' : 'auto';
    if (!m) return { reply: 'Vad vill du ändra? Säg till exempel: byt namn på bandyträning till match, eller: flytta bandyträning till imorgon klockan 19.', expectMore: true };

    // Hitta aktiviteten
    const who = takeDate(m[1], now);
    const q = who.text.replace(rx('\\b(?:i|från) (?:min )?kalender(?:n)?\\b'), ' ');
    const pool = state.events.filter(e => (who.date ? e.date === who.date : e.date >= today)).sort(sortEv);
    const ev = best(pool, q, e => e.title);
    if (!ev) return { reply: `Jag hittade ingen aktivitet som heter ${q.trim()}.`, expectMore: true, ui: { tab: 'cal' } };

    const target = m[2].trim();
    const old = eventPhrase(ev, now);

    if (mode === 'gather') {
      const tm = takeTimes('kl ' + target.replace(rx('^(?:kl|klockan)\\s*'), ''), false);
      if (!tm.start) return { reply: 'Vilken tid ska samlingen vara?', expectMore: true };
      ev.gather = tm.start;
      return { reply: `Klart snygging! Samlingen för ${ev.title} är nu klockan ${sayTime(ev.gather)}. Något mer?`, expectMore: true, ui: { tab: 'cal', flash: ev.id } };
    }

    if (mode !== 'rename') {
      const evening = rx('\\b(?:kväll|kvällen|eftermiddag)\\b').test(target);
      const d = takeDate(target, now);
      // "till 19" utan "kl" ska också räknas som tid
      const tt = rx('^\\d{1,2}(?:[:.]\\d{2})?\\b').test(d.text.trim()) ? 'kl ' + d.text.trim() : d.text;
      const tm = takeTimes(tt, evening);
      if (d.date || tm.start || tm.gather) {
        if (d.date) ev.date = d.date;
        if (tm.start) {
          const mins = s => +s.slice(0, 2) * 60 + +s.slice(3);
          const hhmm = x => { x = (x + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
          const shift = ev.start ? mins(tm.start) - mins(ev.start) : 0;
          if (tm.end) ev.end = tm.end;
          else if (ev.start && ev.end) ev.end = hhmm(mins(ev.end) + shift);    // behåll samma längd
          if (ev.gather && ev.start && !tm.gather) ev.gather = hhmm(mins(ev.gather) + shift); // samlingen följer med
          ev.start = tm.start;
        }
        if (tm.gather) ev.gather = tm.gather;
        return { reply: `Fixat snygging! Jag har flyttat det, nu är det ${eventPhrase(ev, now)}. Något mer?`, expectMore: true, ui: { tab: 'cal', flash: ev.id } };
      }
      if (mode === 'time') return { reply: `Vart ska jag flytta ${ev.title}? Säg en dag eller en tid.`, expectMore: true };
    }

    // Byt namn
    const oldTitle = ev.title;
    ev.title = cap(target.replace(rx('^(?:det |den )'), ''));
    return { reply: `Klart snygging! ${oldTitle} heter nu ${ev.title}. Något mer?`, expectMore: true, ui: { tab: 'cal', flash: ev.id } };
  }

  function handleDelete(t, state, now) {
    const m = t.match(rx('^(?:ta bort|radera|stryk|avboka|ställ in)\\s+(.+)$'));
    const d = takeDate(m[1], now);
    const q = d.text.replace(rx('\\b(?:från|ur|i) (?:min )?kalender(?:n)?\\b'), ' ');
    const today = iso(now);
    const pool = state.events.filter(e => (d.date ? e.date === d.date : e.date >= today)).sort(sortEv);
    const hit = best(pool, q, e => e.title);
    if (!hit) return { reply: 'Jag hittade ingen sådan händelse i kalendern.', expectMore: true, ui: { tab: 'cal' } };
    state.events = state.events.filter(e => e.id !== hit.id);
    return { reply: `Okej, jag har tagit bort ${eventPhrase(hit, now)}. Något mer?`, expectMore: true, ui: { tab: 'cal' } };
  }

  // Tolka EN aktivitet ur en bit text. inheritDate = dagen från föregående aktivitet i samma mening.
  function parseEvent(t, now, inheritDate) {
    const evening = rx('\\b(?:kväll|kvällen|eftermiddag|eftermiddagen)\\b').test(t);
    const d = takeDate(t, now);
    const tm = takeTimes(d.text, evening);
    const title = cleanTitle(tm.text);
    let date = d.date || inheritDate || iso(now);
    // Ingen dag sagd och tiden har redan passerat idag → imorgon
    if (!d.date && !inheritDate && tm.start && tm.start < `${pad(now.getHours())}:${pad(now.getMinutes())}`) date = iso(addDays(now, 1));
    return { title, date, hasDate: !!d.date, hasTime: !!(tm.start || tm.gather), start: tm.start, end: tm.end, gather: tm.gather };
  }

  // Dela "äta banan den 26 nov, fiska den 10 dec kl 10-15 och gröt den 29:e kl 8" i en bit per aktivitet
  function splitEvents(t, now) {
    const parts = t.split(rx('\\s*,\\s*|\\s+(?:och|samt|sen|sedan|plus|därefter)\\s+')).map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const seps = [];                                       // kom ihåg vad som stod mellan bitarna
    let rest = t;
    for (let i = 0; i < parts.length - 1; i++) {
      const at = rest.indexOf(parts[i]) + parts[i].length;
      rest = rest.slice(at);
      const nx = rest.indexOf(parts[i + 1]);
      seps.push(rest.slice(0, nx).trim() || ',');
      rest = rest.slice(nx);
    }
    const glue = (a, sep, b2) => `${a}${sep === ',' ? ',' : ' ' + sep} ${b2}`;
    // 1) Bitar utan namn ("med samling 20", "20" från "mellan 18 och 20") hör till biten före
    let segs = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
      const p = parseEvent(parts[i], now);
      if (!p.title) segs[segs.length - 1] = glue(segs[segs.length - 1], seps[i - 1], parts[i]);
      else segs.push(parts[i]);
    }
    // 2) Bitar med namn men utan dag/tid ("middag" i "middag och bio på fredag") hör till biten efter
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      const p = parseEvent(segs[i], now);
      if (!p.hasDate && !p.hasTime && i < segs.length - 1) segs[i + 1] = segs[i] + ' och ' + segs[i + 1];
      else out.push(segs[i]);
    }
    if (out.length < 2) return null;
    // Minst två riktiga aktiviteter med egen dag eller tid krävs
    const real = out.map(x => parseEvent(x, now)).filter(p => p.title && (p.hasDate || p.hasTime));
    return real.length >= 2 ? out : null;
  }

  function handleAdd(t, state, now) {
    const segs = splitEvents(t, now);
    if (segs) {
      const added = [], skipped = [];
      let lastDate = null;
      for (const seg of segs) {
        const p = parseEvent(seg, now, lastDate);
        if (!p.title) { skipped.push(seg); continue; }
        const ev = { id: uid(), title: p.title, date: p.date, start: p.start, end: p.end, gather: p.gather };
        state.events.push(ev); added.push(ev); lastDate = p.date;
      }
      if (added.length) {
        const list = added.map(ev => eventPhrase(ev, now));
        return {
          reply: `Jag löser det snygging! Jag har lagt till ${added.length} aktiviteter: ${joinList(list)}.${skipped.length ? ` Jag förstod inte "${skipped.join('", "')}".` : ''} Är det något mer?`,
          expectMore: true, ui: { tab: 'cal', flash: added[0].id },
        };
      }
    }
    const p = parseEvent(t, now);
    if (!p.title) {
      pending = { type: 'event-title', text: t, at: Date.now() };
      return { reply: 'Javisst! Vad ska jag lägga in?', expectMore: true };
    }
    const ev = { id: uid(), title: p.title, date: p.date, start: p.start, end: p.end, gather: p.gather };
    state.events.push(ev);
    return {
      reply: `Jag löser det snygging! Jag har nu lagt till ${eventPhrase(ev, now)} i din kalender. Är det något mer du vill göra?`,
      expectMore: true, ui: { tab: 'cal', flash: ev.id },
    };
  }

  // "Kan du ta bort…", "Skulle du kunna lägga till…", "Jag vill flytta…" → själva kommandot
  const VERB_FORMS = [['lägga', 'lägg'], ['byta', 'byt'], ['döpa', 'döp'], ['stryka', 'stryk'], ['nollställa', 'nollställ'],
    ['återställa', 'återställ'], ['bocka', 'bocka'], ['kryssa', 'kryssa'], ['skriva', 'skriv'], ['sätta', 'sätt'], ['göra', 'gör']];
  function politeStrip(t) {
    let prev;
    do {
      prev = t;
      t = t.replace(rx('^(?:snälla|hörru|hör du|okej|ok|och|men|så|asså|alltså|eh|öh|ja|jo)\\s+'), '')
        .replace(rx('^(?:kan du|kan ni|kunde du|skulle du kunna|vill du|orkar du|är du snäll och|jag vill att du|jag skulle vilja att du|jag skulle vilja|jag vill|jag behöver|får jag be dig|hjälp mig(?: att| med att)?)\\s+'), '')
        .replace(rx('\\s+(?:tack|snälla|är du snäll|tack så mycket)$'), '');
    } while (t !== prev);
    for (const [inf, imp] of VERB_FORMS) t = t.replace(rx(`^${inf}\\b`), imp);
    return t.trim();
  }

  // ---------- Huvudfunktion ----------
  function handle(raw, state, now = new Date()) {
    state.events = state.events || [];
    state.checklists = state.checklists || [];
    const t = politeStrip(stripWake(norm(raw)));

    if (!t) return { reply: 'Ja snygging? Vad kan jag göra för dig?', expectMore: true };

    if (pending && Date.now() - pending.at > PENDING_MS) pending = null;
    if (pending) {
      const p = pending; pending = null;
      const r = handlePending(p, t, state, now);
      if (r) return r;
    }

    if (rx('^(?:nej|nä|nää|nope|det var allt|inget mer|inte just nu|tack|tack så mycket|nej tack|det är bra|det räcker|hejdå|hej då|klart)(?: (?:det var allt|tack|snygging|så mycket|hejdå|hej då|det är bra|det räcker))*$').test(t))
      return { reply: 'Okej snygging, hörs!', expectMore: false };

    if (rx('\\b(?:vad kan du|hjälp|hur funkar du)\\b').test(t))
      return { reply: 'Jag kan lägga in saker i din kalender, berätta vad du har inplanerat, och köra dina checklistor. Säg till exempel: lägg till bandyträning imorgon klockan 21 till 22, eller: visa packlistan.', expectMore: true };

    if (/list|bocka|kryssa|kvar/.test(t) || rx('^(?:jag har (?:packat|tagit|gjort|fixat|köpt)|klar med)\\b').test(t))
      return handleList(t, state);

    if (rx('^(?:vad|vilka|har jag|hur ser|när)\\b').test(t) && /har jag|händer|planerat|gång|kalender|schema|ut|bokat|inbokat/.test(t))
      return handleQuery(t, state, now);

    if (rx('^(?:ändra|byt|döp om|flytta|uppdatera|sätt om)\\b').test(t)) return handleEdit(t, state, now);

    if (rx('^(?:ta bort|radera|stryk|avboka|ställ in)\\b').test(t)) return handleDelete(t, state, now);
    // "…bandyträningen imorgon kan du ta bort" eller annan ordföljd: ta aldrig "ta bort" som en ny aktivitet
    const del = t.match(rx('\\b(?:ta bort|radera|avboka|ställ in)\\b'));
    if (del) return handleDelete('ta bort ' + t.replace(del[0], ' ').replace(/\s+/g, ' ').trim(), state, now);

    if (rx('^(?:lägg|boka|skapa|planera|skriv|notera|sätt|påminn|jag ska|jag har|vi ska|vi har|jag måste)\\b').test(t) || rx(`\\b${KL}\\d`).test(t) || takeDate(t, now).date)
      return handleAdd(t, state, now);

    return { reply: `Jag förstod inte riktigt "${t}". Säg till exempel: lägg till bandyträning imorgon klockan 21, eller: ta bort bandyträningen.`, expectMore: true };
  }

  const api = { handle, iso, fromIso, addDays, sayDate, sayTime, uid, cap, DAYS, MONTHS, sortEv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Brain = api;
})(this);
