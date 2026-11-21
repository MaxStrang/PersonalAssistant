// Kör: node test.js
const B = require('./brain.js');
const now = new Date(2026, 10, 21, 18, 0); // lördag 21 nov 2026 18:00
const state = {
  events: [],
  checklists: [{ id: 'p', name: 'Packlista bandy', items: ['Skridskor', 'Klubba', 'Hjälm', 'Benskydd'].map(text => ({ text, done: false })) },
               { id: 'h', name: 'Handla', items: [{ text: 'Mjölk', done: false }] }],
};
const say = s => { const r = B.handle(s, state, now); console.log('> ' + s + '\n  ' + r.reply + '\n'); return r; };

say('Hallå snygging, lägg till bandyträning kl 21:00-22:00 i min kalender, med samling klockan 20:00');
say('Hallå snygging lägg till tandläkare imorgon klockan 9.30');
say('boka middag med mamma på fredag mellan 18 och 20');
say('lägg in möte den 3 december kl 10-11');
say('vad har jag idag');
say('vad har jag i veckan');
say('ta bort middag med mamma');
say('visa packlistan bandy');
say('bocka av skridskor och hjälmen');
say('vad är kvar');
say('lägg till vattenflaska på packlistan');
say('jag har köpt mjölk');
say('nollställ packlistan');
say('skapa en ny lista som heter Städning');
say('hallå snygging');
say('nej det var allt');
console.log(JSON.stringify(state.events, null, 1));
