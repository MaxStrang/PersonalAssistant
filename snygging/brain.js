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
      .replace(/[^a-z0-9åäöéü:.\-\/ ]+/g, ' ')
      .replace(/\.(?!\d)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function stripWake(t) {
    return t.replace(rx('^(?:(?:hall[åa]|hallå där|hej|hejsan|tja|okej|ok|du)\\s+)?snygg(?:ing|ingen|isen)\\b\\s*'), '').trim();
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
    t = t.replace(rx('\\b(?:kan du|skulle du kunna|kan jag få|snälla|tack|är du snäll och|jag vill att du|jag vill)\\b', 'g'), ' ')
      .replace(rx('\\b(?:lägg(?:a)? (?:till|in)|boka(?: in)?|skapa|planera|skriv(?:a)? (?:in|upp)|notera|sätt(?:a)? upp|påminn mig om)\\b', 'g'), ' ')
      .replace(rx('\\b(?:i|till|på|in i) (?:min |mina )?kalender(?:n)?\\b', 'g'), ' ')
      .replace(/\s+/g, ' ').trim();
    const w = t.split(' ').filter(Boolean);
    while (w.length && STOP.has(w[0])) w.shift();
    while (w.length && STOP.has(w[w.length - 1])) w.pop();
    return cap(w.join(' '));
  }

  function eventPhrase(e, now, withDate = true) {
    let s = withDate ? `${e.title} ${sayDate(e.date, now)}` : e.title;
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
    return norm(s).replace(/[:.\-\/]/g, ' ').split(' ')
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
  const splitItems = s => s.split(rx(',|\\boch\\b')).map(x => x.trim()).filter(Boolean);

  function handleList(t, state) {
    let m;
    const ui = list => ({ tab: 'lists', open: list && list.id });

    // Skapa ny lista
    m = t.match(rx('\\b(?:skapa|gör|lägg till|starta)\\s+(?:en\\s+)?(?:ny\\s+)?(?:check)?lista(?:\\s+(?:som heter|med namnet|kallad|för))?\\s+(.+)$'));
    if (m) {
      const list = { id: uid(), name: cap(m[1].trim()), items: [] };
      state.checklists.push(list); state.activeList = list.id;
      return { reply: `Fixat snygging! Jag har skapat listan ${list.name}. Vad ska stå på den?`, expectMore: true, ui: ui(list) };
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

  function handleAdd(t, state, now) {
    const evening = rx('\\b(?:kväll|kvällen|eftermiddag|eftermiddagen)\\b').test(t);
    const d = takeDate(t, now);
    const tm = takeTimes(d.text, evening);
    const title = cleanTitle(tm.text);
    if (!title) return { reply: 'Vad ska jag lägga in i kalendern, snygging?', expectMore: true };
    let date = d.date || iso(now);
    // Ingen dag sagd och tiden har redan passerat idag → imorgon
    if (!d.date && tm.start && tm.start < `${pad(now.getHours())}:${pad(now.getMinutes())}`) date = iso(addDays(now, 1));
    const ev = { id: uid(), title, date, start: tm.start, end: tm.end, gather: tm.gather };
    state.events.push(ev);
    return {
      reply: `Jag löser det snygging! Jag har nu lagt till ${eventPhrase(ev, now)} i din kalender. Är det något mer du vill göra?`,
      expectMore: true, ui: { tab: 'cal', flash: ev.id },
    };
  }

  // ---------- Huvudfunktion ----------
  function handle(raw, state, now = new Date()) {
    state.events = state.events || [];
    state.checklists = state.checklists || [];
    const t = stripWake(norm(raw));

    if (!t) return { reply: 'Ja snygging? Vad kan jag göra för dig?', expectMore: true };

    if (rx('^(?:nej|nä|nää|nope|det var allt|inget mer|inte just nu|tack|tack så mycket|nej tack|det är bra|det räcker|hejdå|hej då|klart)(?: (?:det var allt|tack|snygging|så mycket|hejdå|hej då|det är bra|det räcker))*$').test(t))
      return { reply: 'Okej snygging, hörs!', expectMore: false };

    if (rx('\\b(?:vad kan du|hjälp|hur funkar du)\\b').test(t))
      return { reply: 'Jag kan lägga in saker i din kalender, berätta vad du har inplanerat, och köra dina checklistor. Säg till exempel: lägg till bandyträning imorgon klockan 21 till 22, eller: visa packlistan.', expectMore: true };

    if (/list|bocka|kryssa|kvar/.test(t) || rx('^(?:jag har (?:packat|tagit|gjort|fixat|köpt)|klar med)\\b').test(t))
      return handleList(t, state);

    if (rx('^(?:vad|vilka|har jag|hur ser|när)\\b').test(t) && /har jag|händer|planerat|gång|kalender|schema|ut|bokat|inbokat/.test(t))
      return handleQuery(t, state, now);

    if (rx('^(?:ta bort|radera|stryk|avboka|ställ in)\\b').test(t)) return handleDelete(t, state, now);

    if (rx('^(?:lägg|boka|skapa|planera|skriv|notera|sätt|påminn|kan du|jag ska)\\b').test(t) || rx(`\\b${KL}\\d`).test(t))
      return handleAdd(t, state, now);

    return { reply: 'Förlåt snygging, det fattade jag inte. Säg till exempel: lägg till bandyträning imorgon klockan 21.', expectMore: true };
  }

  const api = { handle, iso, fromIso, addDays, sayDate, sayTime, uid, cap, DAYS, MONTHS, sortEv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Brain = api;
})(this);
