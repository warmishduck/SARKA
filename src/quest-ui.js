// The quest's on-screen extras, plain DOM on top of the AR canvas: a hint, one action button and
// a note that the visitor is carrying the item. Styles are in index.css (the `.ui-quest*` rules).
// Texts are given as i18n keys, so a language switch redraws whatever is on screen.
import {onLangChange, TEXT} from './i18n'

const make = (tag, className, props) => Object.assign(document.createElement(tag), {className}, props)

/**
 * @returns {{
 *   showHint: (key: string | null) => void,
 *   showButton: (key: string | null, onPress?: () => void) => void,
 *   showBadge: (key: string | null) => void,
 * }} Passing null hides that part.
 */
export const createQuestUi = () => {
  const root = make('div', 'ui ui-quest')
  const badge = make('div', 'ui-toast ui-quest-badge')
  const hint = make('div', 'ui-toast ui-quest-hint')
  const button = make('button', 'ui-pill ui-quest-button', {type: 'button'})
  root.append(badge, hint, button)
  document.body.appendChild(root)

  const keys = {badge: null, hint: null, button: null}
  let press = null
  const nodes = {badge, hint, button}
  const draw = (part) => {
    const key = keys[part]
    if (key !== null) {
      nodes[part].textContent = TEXT[key]
    }
    nodes[part].classList.toggle('is-visible', key !== null)
  }
  const show = (part, key) => {
    keys[part] = key
    draw(part)
  }

  button.addEventListener('click', () => press?.())
  onLangChange(() => Object.keys(keys).forEach(draw))

  return {
    showHint: (key) => show('hint', key),
    showButton(key, onPress = null) {
      press = onPress
      show('button', key)
    },
    showBadge: (key) => show('badge', key),
  }
}
