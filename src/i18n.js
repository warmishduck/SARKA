// The demo's languages and the language switch's state, shared by every screen (the AR view's
// on-screen extras in ui.js, the welcome page in welcome.js). All user-facing text lives in
// STRINGS, one object per language, so it is easy to change or add to. config.test.js checks
// every language carries exactly the same set of keys, so a missing or extra one fails the build.
//
// NOTE: the Finnish (fi) and Swedish (sv) strings are my drafts — accurate enough to ship a demo,
// but a native speaker (e.g. museum staff) should read them over before the real opening,
// especially the longer sentences and the museum-signage tone.

export const STRINGS = {
  en: {
    loading: (done, total) => `Loading creatures… ${done}/${total}`,
    hintCreatures: 'Tap a creature — it reacts',
    hintWall: 'Someone is hiding behind the wall — tap it',
    hintFloor: 'Look down at the floor — the creature lands there',
    mute: 'Mute sound',
    unmute: 'Unmute sound',
    photo: 'Take a photo',
    share: 'Share',
    close: 'Close',
    saveHelp: 'Press and hold the photo to save it',
    photoFailed: 'Could not take a photo',
    rotateRight: 'Rotate right',
    rotateLeft: 'Rotate left',
    language: 'Language',
    title: 'Sarka AR',
    welcomeTitle: 'Sarka AR',
    welcomeBody: 'Scan the QR code next to an exhibit to meet its creature',
    welcomeUnknown: 'This code was not recognised. Try scanning it again.',
    scanObjects: 'Scan an object',
    scanHint: 'Point the camera at a museum exhibit',
    scanFloor: 'Found it! Now point the camera at the floor in front of you',
    scanMove: 'Hold on, the camera is getting its bearings. Move the phone slowly from side to side',
    scanMarker: 'Found it! Now point the camera at the marker on the floor',
    scanFindObject: 'Found it! Now find the exhibit object and point the camera at it',
    scanTapObject: 'Now tap the spot on the screen where the object stands on the floor',
    scanHoldObject: 'Got it. Keep the object in view while it is recognised',
    scanFitObject: 'Found it! Now fit the exhibit object into the frame',
    scanFitObjectStart: 'Fit the exhibit object into the frame',
    scanHoldSteady: 'Hold still…',
    scanCentreObject: 'Move a little so the object sits in the middle of the frame',
    scanFloorFirst: 'Point the camera briefly at the floor, then look up at the exhibit',
    puzzleSkip: 'Skip puzzle',
    questAsk: 'The ghost has lost a sock. Can you help find it?',
    questSearch: 'Look for the sock',
    questFitFind: 'Fit the air purifier into the frame',
    questTapItem: 'A sock! Tap it to take it',
    questCarrying: 'Sock with you',
    questReturn: 'Take the sock back to the ghost: point the camera at the cats painting',
    questGive: 'Give the sock',
    questThanks: 'Thank you!',
  },
  fi: {
    loading: (done, total) => `Ladataan olentoja… ${done}/${total}`,
    hintCreatures: 'Napauta olentoa — se reagoi',
    hintWall: 'Joku piileskelee muurin takana — napauta sitä',
    hintFloor: 'Katso lattialle — olento laskeutuu sinne',
    mute: 'Mykistä ääni',
    unmute: 'Poista mykistys',
    photo: 'Ota kuva',
    share: 'Jaa',
    close: 'Sulje',
    saveHelp: 'Paina kuvaa pitkään tallentaaksesi sen',
    photoFailed: 'Kuvan ottaminen epäonnistui',
    rotateRight: 'Käännä oikealle',
    rotateLeft: 'Käännä vasemmalle',
    language: 'Kieli',
    title: 'Sarka AR',
    welcomeTitle: 'Sarka AR',
    welcomeBody: 'Skannaa näyttelyesineen vieressä oleva QR-koodi tavataksesi sen olennon',
    welcomeUnknown: 'Koodia ei tunnistettu. Yritä skannata se uudelleen.',
    scanObjects: 'Skannaa esine',
    scanHint: 'Osoita kamera museoesineeseen',
    scanFloor: 'Löytyi! Osoita nyt kameralla lattiaan edessäsi',
    scanMove: 'Hetki, kamera hahmottaa tilaa. Liikuta puhelinta hitaasti sivulta toiselle',
    scanMarker: 'Löytyi! Osoita nyt kameralla lattialla olevaa merkkiä',
    scanFindObject: 'Löytyi! Etsi nyt esine ja osoita kamera sitä kohti',
    scanTapObject: 'Napauta nyt ruudulla kohtaa, jossa esine seisoo lattialla',
    scanHoldObject: 'Selvä. Pidä esine kuvassa, kun sitä tunnistetaan',
    scanFitObject: 'Löytyi! Sovita nyt esine kehykseen',
    scanFitObjectStart: 'Sovita esine kehykseen',
    scanHoldSteady: 'Pidä paikallasi…',
    scanCentreObject: 'Siirry hieman, niin että esine on kehyksen keskellä',
    scanFloorFirst: 'Osoita kamera hetkeksi lattiaan, sitten nosta se kohti esinettä',
    puzzleSkip: 'Ohita palapeli',
    questAsk: 'Aave on kadottanut sukan. Autatko löytämään sen?',
    questSearch: 'Etsi sukka',
    questFitFind: 'Sovita ilmanpuhdistin kehykseen',
    questTapItem: 'Sukka! Ota se napauttamalla',
    questCarrying: 'Sukka mukana',
    questReturn: 'Vie sukka aaveelle: osoita kamera kissatauluun',
    questGive: 'Anna sukka',
    questThanks: 'Kiitos!',
  },
  sv: {
    loading: (done, total) => `Laddar varelser… ${done}/${total}`,
    hintCreatures: 'Tryck på en varelse — den reagerar',
    hintWall: 'Någon gömmer sig bakom muren — tryck på den',
    hintFloor: 'Titta ner på golvet — varelsen landar där',
    mute: 'Stäng av ljud',
    unmute: 'Sätt på ljud',
    photo: 'Ta ett foto',
    share: 'Dela',
    close: 'Stäng',
    saveHelp: 'Håll in bilden för att spara den',
    photoFailed: 'Det gick inte att ta ett foto',
    rotateRight: 'Vrid åt höger',
    rotateLeft: 'Vrid åt vänster',
    language: 'Språk',
    title: 'Sarka AR',
    welcomeTitle: 'Sarka AR',
    welcomeBody: 'Skanna QR-koden bredvid ett utställningsföremål för att möta dess varelse',
    welcomeUnknown: 'Koden kändes inte igen. Försök skanna den igen.',
    scanObjects: 'Skanna ett föremål',
    scanHint: 'Rikta kameran mot ett museiföremål',
    scanFloor: 'Hittad! Rikta nu kameran mot golvet framför dig',
    scanMove: 'Vänta, kameran orienterar sig. Flytta telefonen långsamt från sida till sida',
    scanMarker: 'Hittad! Rikta nu kameran mot markören på golvet',
    scanFindObject: 'Hittad! Hitta nu föremålet och rikta kameran mot det',
    scanTapObject: 'Tryck nu på skärmen där föremålet står på golvet',
    scanHoldObject: 'Okej. Håll föremålet i bild medan det känns igen',
    scanFitObject: 'Hittad! Passa nu in föremålet i ramen',
    scanFitObjectStart: 'Passa in föremålet i ramen',
    scanHoldSteady: 'Håll still…',
    scanCentreObject: 'Flytta dig lite så att föremålet hamnar mitt i ramen',
    scanFloorFirst: 'Rikta kameran kort mot golvet, lyft sedan mot föremålet',
    puzzleSkip: 'Hoppa över pusslet',
    questAsk: 'Spöket har tappat en strumpa. Kan du hjälpa till att hitta den?',
    questSearch: 'Leta efter strumpan',
    questFitFind: 'Passa in luftrenaren i ramen',
    questTapItem: 'En strumpa! Tryck på den för att ta den',
    questCarrying: 'Du har strumpan',
    questReturn: 'Ta strumpan till spöket: rikta kameran mot kattavlan',
    questGive: 'Ge strumpan',
    questThanks: 'Tack!',
  },
}

// The museum's languages (Finnish, English, Swedish), in the order the picker lists
// them. LANG_LABELS is the two-letter badge on the corner button; LANG_NAMES is each language's
// own name, shown in the picker menu (so a Finnish visitor sees "Suomi", not a foreign word for
// their language).
export const LANGS = ['fi', 'en', 'sv']
export const LANG_LABELS = {fi: 'FI', en: 'EN', sv: 'SV'}
export const LANG_NAMES = {fi: 'Suomi', en: 'English', sv: 'Svenska'}
export const DEFAULT_LANG = 'fi'

// localStorage is shared by every site on the same host (all of someone.github.io), and the live
// site stores its choice under the plain key `lumina-ar-lang`: so this one carries the site's
// folder, or a language picked on the live site would turn up here, and the other way round.
const LANG_KEY = `lumina-ar-lang:${typeof location !== 'undefined' ? location.pathname.replace(/[^/]*$/, '') : ''}`

// Starts from whatever the visitor picked last time, otherwise DEFAULT_LANG. Not the phone's own
// language: a phone set to Swedish or English is no sign the visitor wants it here.
const detectLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (LANGS.includes(saved)) {
      return saved
    }
  } catch (e) {
    // Storage blocked (private mode, restricted embed): the default it is.
  }
  return DEFAULT_LANG
}

const saveLang = (lang) => {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch (e) {
    // Not persisted this time; the switch still works for the rest of the visit.
  }
}

// The strings for whatever language is current. Its identity never changes (callers keep a
// reference, e.g. `ui.text.won`), only its contents do, so a language switch updates every
// string in place without the caller having to re-fetch anything.
export const TEXT = {}

let lang = detectLang()
Object.assign(TEXT, STRINGS[lang])
const listeners = []

// The page's own language and title follow the switch (browsers use them for hyphenation,
// screen readers, the tab's name).
const updateDocument = () => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.title = TEXT.title
  }
}
updateDocument()

export const getLang = () => lang

export const setLang = (next) => {
  if (!LANGS.includes(next)) {
    return
  }
  lang = next
  saveLang(next)
  Object.assign(TEXT, STRINGS[next])
  updateDocument()
  listeners.forEach((listener) => listener(next))
}

// `listener(lang)` is called after every switch.
export const onLangChange = (listener) => {
  listeners.push(listener)
}

// Builds the corner language control: a small round button showing the current language's badge
// (FI/EN/SV/UA) that opens a popup menu of all four, each in its own name. Returned as a detached
// <button> (class `ui-lang`, so the corner-positioning CSS applies) to append wherever the control
// goes; it keeps its own badge in sync with the language, so callers don't manage it. `onInteract`
// runs when the menu opens (ui.js uses it to unlock audio on the first gesture).
export const createLangPicker = ({onInteract = () => {}} = {}) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ui-button ui-lang'
  const sync = () => {
    button.textContent = LANG_LABELS[lang]
    button.setAttribute('aria-label', TEXT.language)
  }
  sync()
  onLangChange(sync)

  let menu = null
  const closeMenu = () => {
    if (menu) {
      menu.remove()
      menu = null
      document.removeEventListener('pointerdown', onOutside, true)
    }
  }
  // A tap anywhere that isn't the menu or the button itself dismisses the menu (the button's own
  // tap is handled by its click, which toggles).
  const onOutside = (event) => {
    if (menu && !menu.contains(event.target) && event.target !== button) {
      closeMenu()
    }
  }
  button.addEventListener('click', () => {
    onInteract()
    if (menu) {
      closeMenu()
      return
    }
    menu = document.createElement('div')
    menu.className = 'ui-lang-menu'
    LANGS.forEach((code) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = `ui-lang-option${code === lang ? ' is-current' : ''}`
      option.textContent = LANG_NAMES[code]
      option.addEventListener('click', (event) => {
        event.stopPropagation()
        setLang(code)
        closeMenu()
      })
      menu.appendChild(option)
    })
    document.body.appendChild(menu)
    // Pin it just under the button, aligned to the button's right edge (the button lives in a
    // top corner), clamped away from the screen edge.
    const r = button.getBoundingClientRect()
    menu.style.top = `${r.bottom + 8}px`
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`
    document.addEventListener('pointerdown', onOutside, true)
  })
  return button
}
