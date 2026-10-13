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
    loadingLevel: 'Loading the level…',
    hintCreatures: 'Tap a creature — it reacts',
    hintWall: 'Someone is hiding behind the wall — tap it',
    hintLevel: 'Tap the ground — the Glowcap walks there. Its light builds the bridge',
    modeToLevel: '🎮 Level',
    modeToCreatures: '🌰 Creatures',
    actionGrow: '🌿 Grow a branch',
    actionRemove: '🍂 Remove the branch',
    won: 'The Glowcap reached the exit! ✨',
    branchLost: 'The branch is gone: the acorn wandered too far',
    left: 'Left',
    right: 'Right',
    jump: 'Jump',
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
    title: 'Forest Creatures · AR',
    welcomeTitle: 'Forest Creatures',
    welcomeBody: 'Scan the QR code next to an exhibit to meet its creature',
    welcomeUnknown: 'This code was not recognised. Try scanning it again.',
    scanObjects: 'Scan an object',
    scanHint: 'Point the camera at a museum exhibit',
    scanFloor: 'Found it! Now point the camera at the floor in front of you',
    scanMove: 'Hold on, the camera is getting its bearings. Move the phone slowly from side to side',
    scanMarker: 'Found it! Now point the camera at the marker on the floor',
  },
  fi: {
    loading: (done, total) => `Ladataan olentoja… ${done}/${total}`,
    loadingLevel: 'Ladataan tasoa…',
    hintCreatures: 'Napauta olentoa — se reagoi',
    hintWall: 'Joku piileskelee muurin takana — napauta sitä',
    hintLevel: 'Napauta maata — Glowcap kävelee sinne. Sen valo rakentaa sillan',
    modeToLevel: '🎮 Taso',
    modeToCreatures: '🌰 Olennot',
    actionGrow: '🌿 Kasvata oksa',
    actionRemove: '🍂 Poista oksa',
    won: 'Glowcap pääsi uloskäynnille! ✨',
    branchLost: 'Oksa katosi: terho harhautui liian kauas',
    left: 'Vasen',
    right: 'Oikea',
    jump: 'Hyppy',
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
    title: 'Metsän olennot · AR',
    welcomeTitle: 'Metsän olennot',
    welcomeBody: 'Skannaa näyttelyesineen vieressä oleva QR-koodi tavataksesi sen olennon',
    welcomeUnknown: 'Koodia ei tunnistettu. Yritä skannata se uudelleen.',
    scanObjects: 'Skannaa esine',
    scanHint: 'Osoita kamera museoesineeseen',
    scanFloor: 'Löytyi! Osoita nyt kameralla lattiaan edessäsi',
    scanMove: 'Hetki, kamera hahmottaa tilaa. Liikuta puhelinta hitaasti sivulta toiselle',
    scanMarker: 'Löytyi! Osoita nyt kameralla lattialla olevaa merkkiä',
  },
  sv: {
    loading: (done, total) => `Laddar varelser… ${done}/${total}`,
    loadingLevel: 'Laddar nivån…',
    hintCreatures: 'Tryck på en varelse — den reagerar',
    hintWall: 'Någon gömmer sig bakom muren — tryck på den',
    hintLevel: 'Tryck på marken — Glowcap går dit. Dess ljus bygger bron',
    modeToLevel: '🎮 Nivå',
    modeToCreatures: '🌰 Varelser',
    actionGrow: '🌿 Väx en gren',
    actionRemove: '🍂 Ta bort grenen',
    won: 'Glowcap nådde utgången! ✨',
    branchLost: 'Grenen är borta: ekollonet gick för långt',
    left: 'Vänster',
    right: 'Höger',
    jump: 'Hoppa',
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
    title: 'Skogens varelser · AR',
    welcomeTitle: 'Skogens varelser',
    welcomeBody: 'Skanna QR-koden bredvid ett utställningsföremål för att möta dess varelse',
    welcomeUnknown: 'Koden kändes inte igen. Försök skanna den igen.',
    scanObjects: 'Skanna ett föremål',
    scanHint: 'Rikta kameran mot ett museiföremål',
    scanFloor: 'Hittad! Rikta nu kameran mot golvet framför dig',
    scanMove: 'Vänta, kameran orienterar sig. Flytta telefonen långsamt från sida till sida',
    scanMarker: 'Hittad! Rikta nu kameran mot markören på golvet',
  },
  uk: {
    loading: (done, total) => `Завантажую істот… ${done}/${total}`,
    loadingLevel: 'Завантажую рівень…',
    hintCreatures: 'Торкнись істоти — вона зреагує',
    hintWall: 'Хтось ховається за стіною — торкнись її',
    hintLevel: 'Торкнись землі — Glowcap піде туди. Його світло будує міст',
    modeToLevel: '🎮 Рівень',
    modeToCreatures: '🌰 Істоти',
    actionGrow: '🌿 Виростити гілку',
    actionRemove: '🍂 Прибрати гілку',
    won: 'Glowcap дійшов до виходу! ✨',
    branchLost: 'Гілка зникла: жолудь відійшов надто далеко',
    left: 'Вліво',
    right: 'Вправо',
    jump: 'Стрибок',
    mute: 'Вимкнути звук',
    unmute: 'Увімкнути звук',
    photo: 'Зробити фото',
    share: 'Поділитися',
    close: 'Закрити',
    saveHelp: 'Затисни фото, щоб зберегти його',
    photoFailed: 'Не вдалося зробити фото',
    rotateRight: 'Повернути вправо',
    rotateLeft: 'Повернути вліво',
    language: 'Мова',
    title: 'Лісові істоти · AR',
    welcomeTitle: 'Лісові істоти',
    welcomeBody: 'Відскануй QR-код біля експоната, щоб зустріти його істоту',
    welcomeUnknown: 'Цей код не розпізнано. Спробуй відсканувати його ще раз.',
    scanObjects: 'Навести на предмет',
    scanHint: 'Наведи камеру на предмет у залі',
    scanFloor: 'Знайдено! Тепер наведи камеру на підлогу перед собою',
    scanMove: 'Зачекай, камера орієнтується. Повільно поводь телефоном з боку в бік',
    scanMarker: 'Знайдено! Тепер наведи камеру на маркер на підлозі',
  },
}

// The museum's languages (Finnish, English, Swedish) and Ukrainian, in the order the picker lists
// them. LANG_LABELS is the two-letter badge on the corner button; LANG_NAMES is each language's
// own name, shown in the picker menu (so a Finnish visitor sees "Suomi", not a foreign word for
// their language).
export const LANGS = ['fi', 'en', 'sv', 'uk']
export const LANG_LABELS = {fi: 'FI', en: 'EN', sv: 'SV', uk: 'UA'}
export const LANG_NAMES = {fi: 'Suomi', en: 'English', sv: 'Svenska', uk: 'Українська'}
export const DEFAULT_LANG = 'fi'

// localStorage is shared by every site on the same host (all of someone.github.io), and the live
// site stores its choice under the plain key `lumina-ar-lang`: so this one carries the site's
// folder, or a language picked on the live site would turn up here, and the other way round.
const LANG_KEY = `lumina-ar-lang:${typeof location !== 'undefined' ? location.pathname.replace(/[^/]*$/, '') : ''}`

// Starts from whatever the visitor picked last time, otherwise Finnish. Not the phone's own
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
