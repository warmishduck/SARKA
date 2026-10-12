// Checks for the content config (src/content/*.js) and for how an address picks an exhibit
// (src/route.js). Run with: npm test

import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {CREATURES} from '../src/content/creatures.js'
import {EXHIBITS, PREVIEW} from '../src/content/exhibits.js'
import {GAMES} from '../src/content/games.js'
import {DEFAULT_LANG, getLang, LANG_LABELS, LANGS, STRINGS} from '../src/i18n.js'
import {resolveRoute, routeFromImageTarget} from '../src/route.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }
const assetExists = (file) => existsSync(fileURLToPath(new URL(`../src/assets/${file}`, import.meta.url)))
const placements = [...Object.entries(EXHIBITS).flatMap(([code, e]) => e.creatures.map((p) => [code, p])), ...PREVIEW.map((p) => ['preview', p])]

// ---------------------------------------------------------------- the config itself
{ const bad = Object.entries(CREATURES).filter(([, c]) => !assetExists(c.file) || !(c.targetHeight > 0))
  check('every creature has a model file in src/assets and a height', bad.length === 0, bad.map(([id]) => id).join(', ')) }
{ const bad = placements.filter(([, p]) => !Object.hasOwn(CREATURES, p.id))
  check('every placed creature exists in CREATURES', bad.length === 0, bad.map(([code, p]) => `${code}:${p.id}`).join(', ')) }
{ const bad = placements.filter(([, p]) => !Number.isFinite(p.x) || !Number.isFinite(p.z))
  check('every placement has a position', bad.length === 0, bad.map(([code, p]) => `${code}:${p.id}`).join(', ')) }
{ const bad = Object.entries(EXHIBITS).filter(([, e]) => e.game !== undefined && !Object.hasOwn(GAMES, e.game))
  check('every exhibit game is a known game', bad.length === 0, bad.map(([code]) => code).join(', ')) }
{ const bad = Object.values(GAMES).filter((g) => !g.type || !g.data)
  check('every game has a type and level data', bad.length === 0) }
{ const bad = Object.entries(EXHIBITS).filter(([, e]) => e.startIn === 'game' && !e.game)
  check('an exhibit that starts in the game has one', bad.length === 0, bad.map(([code]) => code).join(', ')) }
{ const bad = Object.entries(EXHIBITS).filter(([, e]) => e.creatures.length === 0 && !e.game)
  check('no exhibit is empty (needs a creature or a game)', bad.length === 0, bad.map(([code]) => code).join(', ')) }
{ const bad = Object.keys(EXHIBITS).filter((code) => !/^[a-z0-9][a-z0-9-]{0,31}$/.test(code))
  check('every exhibit code is lower case letters, digits and dashes', bad.length === 0, bad.join(', ')) }

// ---------------------------------------------------------------- the languages
{ const keys = (lang) => Object.keys(STRINGS[lang]).sort().join(',')
  const bad = LANGS.filter((lang) => keys(lang) !== keys(LANGS[0]))
  check('every language has exactly the same texts', bad.length === 0, bad.map((lang) => `${lang} differs from ${LANGS[0]}`).join('; ')) }
{ const bad = LANGS.flatMap((lang) => Object.entries(STRINGS[lang]).filter(([key, value]) => typeof value !== typeof STRINGS[LANGS[0]][key] || value === '').map(([key]) => `${lang}.${key}`))
  check('no text is empty or of another kind (text vs function) than in the first language', bad.length === 0, bad.join(', ')) }
check('the switch knows every language it can show', LANGS.every((lang) => STRINGS[lang] && LANG_LABELS[lang]) && Object.keys(STRINGS).length === LANGS.length)
check('the languages are Finnish, English, Swedish and Ukrainian, in that order', LANGS.join(',') === 'fi,en,sv,uk')
check('with nothing picked yet, the page starts in Finnish', DEFAULT_LANG === 'fi' && getLang() === 'fi')

// ---------------------------------------------------------------- picking an exhibit from the address
const route = (search) => resolveRoute(search)
check('/?c=03 opens exhibit 03', route('?c=03').kind === 'exhibit' && route('?c=03').code === '03' && route('?c=03').exhibit === EXHIBITS['03'])
check('/?c=yard opens the yard game', route('?c=yard').exhibit === EXHIBITS.yard)
check('codes are not case sensitive, and spaces around them are ignored', route('?c=YARD').code === 'yard' && route('?c=%2003%20').code === '03')
check('other parameters do not matter', route('?utm_source=poster&c=02&x=1').code === '02')
check('no code: the welcome page', route('').kind === 'welcome' && route('').unknownCode === false && route('?c=').unknownCode === false)
check('an unknown code: the welcome page, saying so', route('?c=zz').kind === 'welcome' && route('?c=zz').unknownCode === true)
check('junk codes never open anything', ['../x', 'a b', '<script>', 'x'.repeat(200), '-1', '%00'].every((c) => route(`?c=${encodeURIComponent(c)}`).kind === 'welcome'))
check('prototype names are not exhibits', ['constructor', 'toString', '__proto__', 'hasOwnProperty'].every((c) => route(`?c=${c}`).kind === 'welcome'))
check('a custom exhibit list is used when given', resolveRoute('?c=a', {a: {creatures: []}}).kind === 'exhibit')
check('/?scan opens the object scanner', route('?scan').kind === 'scan' && route('?scan=1').kind === 'scan')
check('an exhibit code wins over scan', route('?scan&c=03').kind === 'exhibit')

// ---------------------------------------------------------------- picking an exhibit from a recognised object
check('a known image target opens its exhibit', routeFromImageTarget('abstract-painting')?.code === 'office-painting')
check('an unknown image target opens nothing', routeFromImageTarget('nope') === null && routeFromImageTarget(undefined) === null)
check('image target names are unique across exhibits', (() => {
  const names = Object.values(EXHIBITS).map((e) => e.imageTarget).filter(Boolean)
  return new Set(names).size === names.length
})())

console.log(failures === 0 ? '\nALL CONFIG CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
