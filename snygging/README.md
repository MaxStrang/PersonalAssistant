# Snygging – personlig röstassistent

En webbapp (PWA) med kalender, checklistor och röststyrning på svenska.
Inga servrar, inga API-nycklar. Allt körs i webbläsaren och sparas på telefonen.

## Filer
| Fil | Vad den gör |
|---|---|
| `index.html` | Sidan |
| `style.css` | Utseendet |
| `app.js` | UI, röst (tal in/ut), lagring, export. **Dina förinställda checklistor ligger högst upp här.** |
| `brain.js` | Tolkar vad du säger ("lägg till…", "bocka av…") |
| `sw.js`, `manifest.json`, `icon-*.png` | Gör att den kan installeras på hemskärmen och funkar offline |
| `test.js` | Testa tolkningen: `node test.js` |

## Lägg upp på GitHub Pages
1. Skapa ett nytt repo på GitHub, t.ex. `snygging`. Det kan vara publikt eller privat, men Pages på ett privat repo kräver GitHub Pro.
2. Ladda upp alla filer till roten av repot (*Add file → Upload files*), eller:
   ```bash
   git init && git add . && git commit -m "Snygging v1"
   git branch -M main
   git remote add origin https://github.com/<ditt-namn>/snygging.git
   git push -u origin main
   ```
3. Gå till **Settings → Pages**. Välj **Deploy from a branch**, branch `main` och mapp `/ (root)`, och tryck Save.
4. Efter cirka en minut ligger appen på `https://<ditt-namn>.github.io/snygging/`.

## Installera på telefonen
- **Android (Chrome):** öppna länken, välj ⋮ och sedan *Lägg till på startskärmen*.
- **iPhone (Safari):** öppna länken och välj Dela → *Lägg till på hemskärmen*.
- Första gången du trycker på pratknappen frågar telefonen om mikrofonen. Tryck *Tillåt*.

## Så pratar du med den
Tryck på den stora knappen och prata. När du tystnar i cirka 1,5 sekund svarar den, eller så trycker du på knappen igen när du är klar. Efter svaret lyssnar den igen ("Är det något mer?"). Säg "nej" eller "det var allt" för att avsluta.

- "Hallå snygging, lägg till bandyträning kl 21–22 imorgon, med samling klockan 20"
- "Boka middag med mamma på fredag mellan 18 och 20"
- "Lägg in möte den 3 december kl 10–11"
- "Vad har jag idag?" / "Vad har jag i veckan?"
- "Ta bort tandläkaren"
- "Byt namn på bandyträningen till bandymatch" / "Ändra tandläkaren till läkarbesök"
- "Flytta bandymatchen till imorgon kl 19" (slutet och samlingen flyttas med)
- "Ändra tiden för bandymatchen till 17–18:30" / "Ändra samlingen för bandymatchen till 18:15"
- "Ändra mjölk till havremjölk på handlalistan"
- Du kan också trycka på en aktivitet i kalendern för att redigera den.
- Flera på en gång: "Äta banan den 26 november, åka och fiska den 10 december kl 10–15 och äta gröt den 29:e kl 8–8:15"
- Kalendern har vyerna Dag, Vecka, Månad och År. Tryck två gånger på en dag i månadsvyn för att se dagen timme för timme.
- "Kan du skapa en checklista åt mig" ger följdfrågorna "Vad ska listan heta?" och "Vad ska den innehålla?"
- "Lägg till imorgon kl 16" ger följdfrågan "Vad ska jag lägga in?"
- Säg "avbryt" för att avsluta en följdfråga.
- "Visa packlistan bandy" → "Bocka av skridskor och hjälm" → "Vad är kvar?"
- "Lägg till vattenflaska på packlistan"
- "Jag har köpt mjölk" (letar själv upp rätt lista)
- "Nollställ packlistan" / "Skapa en ny lista som heter Städning"

"Hallå snygging" i början är valfritt, och den fungerar likadant utan.

## Ändra dina förinställda checklistor
Öppna `app.js` och ändra `DEFAULT_LISTS` högst upp. Nya listor dyker upp automatiskt nästa gång appen laddas.

## Synka mellan telefon och dator
Datan sparas i en hemlig gist på ditt GitHub-konto. Ingen server behövs.

1. Gå till GitHub → din profilbild → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Ge den ett namn, t.ex. "Snygging". Välj utgångsdatum (*No expiration* om du inte vill byta) och kryssa **bara i `gist`**. Tryck Generate och kopiera token (`ghp_…`).
3. Öppna Snygging, gå till **⚙︎ → Synk mellan enheter**, klistra in token och tryck **Spara**.
4. Gör samma sak på den andra enheten med **samma token**.

Den synkar när appen öppnas, när du byter tillbaka till den, varje minut och 1,5 sekunder efter varje ändring. Den nyaste versionen vinner.

**Viktigt:** lägg aldrig token i koden eller i repot. Den sparas bara i webbläsaren på varje enhet.

## iPhone
Safari på iPhone stänger ofta av webbläsarens taligenkänning. Då byter Snygging automatiskt till **tangentbordets diktering**:
1. Tryck på **Prata med Snygging**. Skrivfältet och tangentbordet öppnas.
2. Tryck på **mikrofonen nere till höger på tangentbordet** och prata.
3. När du tystnar skickar Snygging själv och svarar med röst.

Krav: diktering ska vara på under *Inställningar → Allmänt → Tangentbord → Aktivera diktering*.
Du kan även välja läget direkt under **⚙︎ → Mikrofon → Taligenkänning → Tangentbordets diktering**.

## Valfritt: mänskligare röst med Azure
Telefonens inbyggda röst låter robotaktig. Azures neurala svenska röster (Sofie, Hillevi, Mattias) låter nästan som en människa, och gratisnivån räcker gott för privat bruk.

1. Gå till portal.azure.com → **Create a resource** → sök **Speech** → **Speech service** → Create.
2. Välj Region **Sweden Central** och Pricing tier **Free F0**. Tryck Review + create.
3. Öppna resursen när den är klar → **Keys and Endpoint** → kopiera **Key 1**. Kolla också **Location/Region**, till exempel `swedencentral`.
4. I Snygging: **⚙︎ → Röst → Röstmotor: Azure neural**. Klistra in nyckeln, kontrollera regionen, välj röst och tryck **Testa rösten**.

Nyckeln sparas bara på enheten och synkas inte, så gör samma sak på varje enhet. Fungerar inte Azure faller appen tillbaka på telefonens röst och visar felet under knappen.

**Bättre gratisröst utan Azure:**
- iPhone: Inställningar → Hjälpmedel → Uppläst innehåll → Röster → Svenska → ladda ner **Alva (Förbättrad)**.
- Dator: använd **Edge**. Där finns "Microsoft Sofie Online (Natural)" inbyggd.

## Bra att veta
- Utan synk sparas data per enhet (localStorage). Du kan också använda *Exportera/Importera* under ⚙︎.
- Gör du ändringar på två enheter samtidigt medan båda är offline vinner den som synkar sist.
- En "hemlig" gist syns inte publikt, men den som har exakt länken kan läsa den. Lägg alltså inte in känsliga saker.
- **Exportera till telefonens kalender (.ics)** lägger in dina händelser i den vanliga kalendern.
- Röstigenkänning fungerar bäst i **Chrome på Android** och **Safari på iPhone**. Firefox saknar stöd, så skriv i textfältet där.
- Den lyssnar inte hela tiden efter "Hallå snygging", utan du trycker på knappen. Webbläsare tillåter inte en mikrofon som alltid är på.
- Rösten kommer från telefonen. På iPhone heter den svenska rösten "Alva", och du kan ladda ner en bättre version under Inställningar → Hjälpmedel → Uppläst innehåll → Röster → Svenska.
