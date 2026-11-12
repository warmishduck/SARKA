// The demo's on-screen extras for the AR view, drawn as plain DOM on top of the AR canvas: a
// loading note, a hint, a mute button, a language switch, and a photo button with a preview sheet. Styles are in index.css (the `.ui-*` rules).
// The text comes from i18n.js.
import {createLangPicker, onLangChange, TEXT} from './i18n'

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

// `onToggleMute()` flips the sound and returns whether it is now muted. `onPhoto` takes a
// photo; pass null when the engine cannot (then no photo button is shown). `onGesture()` is called
// on button presses so the caller can unlock audio (iOS only allows that from a real touch/click).
// `creaturesHint` is the i18n key of the hint shown with the creatures.
export const createUi = ({
  onToggleMute, onPhoto, onGesture = () => {},
  creaturesHint = 'hintCreatures',
}) => {
  const root = make('div', 'ui')
  const loading = make('div', 'ui-toast ui-loading')
  const notice = make('div', 'ui-toast ui-notice')
  const hint = make('div', 'ui-toast ui-hint', {textContent: TEXT[creaturesHint]})
  const mute = make('button', 'ui-button ui-mute', {type: 'button', textContent: '🔊'})
  mute.setAttribute('aria-label', TEXT.mute)
  const langButton = createLangPicker({onInteract: onGesture})   // self-syncing badge + popup menu
  const flash = make('div', 'ui-flash')
  root.append(loading, notice, hint, mute, langButton, flash)

  const shutter = onPhoto ? make('button', 'ui-shutter', {type: 'button'}) : null
  if (shutter) {
    shutter.setAttribute('aria-label', TEXT.photo)
    shutter.addEventListener('click', onPhoto)
    root.append(shutter)
  }

  // The preview sheet shown after a photo is taken.
  const sheet = make('div', 'ui-sheet')
  const image = make('img', 'ui-sheet-image', {alt: ''})
  const note = make('div', 'ui-sheet-note')
  const actions = make('div', 'ui-sheet-actions')
  const share = make('button', 'ui-pill', {type: 'button', textContent: TEXT.share})
  const close = make('button', 'ui-pill ui-pill-quiet', {type: 'button', textContent: TEXT.close})
  actions.append(share, close)
  sheet.append(image, note, actions)
  root.append(sheet)

  document.body.appendChild(root)

  const setVisible = (node, visible) => node.classList.toggle('is-visible', visible)

  // Tracked so a language switch can redraw whatever is currently on screen without disturbing
  // it otherwise (state that came from outside, like the loading count or the mute icon, isn't
  // ui.js's own to recompute).
  let muted = false
  let lastLoading = null

  // Redraws every piece of static text in the current language. Called once at start and again
  // whenever the language changes; `ui.text.*` itself is the same object throughout (see TEXT in
  // i18n.js), so a notice about to be shown picks up the switch too.
  const refreshTexts = () => {
    // langButton keeps its own badge/aria in sync (see createLangPicker).
    mute.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute)
    if (shutter) {
      shutter.setAttribute('aria-label', TEXT.photo)
    }
    share.textContent = TEXT.share
    close.textContent = TEXT.close
    hint.textContent = TEXT[creaturesHint]
    if (lastLoading) {
      loading.textContent = TEXT.loading(lastLoading.done, lastLoading.total)
    }
  }

  mute.addEventListener('click', () => {
    muted = onToggleMute()
    mute.textContent = muted ? '🔇' : '🔊'
    mute.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute)
  })

  onLangChange(refreshTexts)

  close.addEventListener('click', () => setVisible(sheet, false))

  // Opens the phone's share sheet (which has "Save Image"). Where that is not available,
  // fall back to telling the person to press and hold the photo, which saves it on iOS.
  share.addEventListener('click', async () => {
    const blob = await (await fetch(image.src)).blob()
    const file = new File([blob], 'lumina-creatures.jpg', {type: 'image/jpeg'})
    if (navigator.canShare && navigator.canShare({files: [file]})) {
      try {
        await navigator.share({files: [file]})
      } catch (e) {
        // The person closed the share sheet without choosing anything; that's fine.
      }
    } else {
      note.textContent = TEXT.saveHelp
    }
  })

  refreshTexts()   // the language may have been detected/restored, so draw it before anything shows

  let noticeTimer = null
  return {
    setLoading(done, total) {
      lastLoading = {done, total}
      loading.textContent = TEXT.loading(done, total)
      setVisible(loading, done < total)
    },
    showHint: () => setVisible(hint, true),
    hideHint: () => setVisible(hint, false),
    // A brief message near the top, e.g. when a photo fails.
    notice(message, ms = 2500) {
      notice.textContent = message
      setVisible(notice, true)
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => setVisible(notice, false), ms)
    },
    hideNotice() {
      clearTimeout(noticeTimer)
      setVisible(notice, false)
    },
    flash() {
      flash.classList.remove('is-flashing')
      void flash.offsetWidth  // restart the CSS animation if it is already running
      flash.classList.add('is-flashing')
    },
    showPhoto(base64Jpeg) {
      image.src = `data:image/jpeg;base64,${base64Jpeg}`
      note.textContent = ''
      setVisible(sheet, true)
    },
    text: TEXT,
  }
}
