// Checks for the fetch quest's steps (src/quest.js). Run with: npm test

import {createQuest} from '../src/quest.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failures++ }

{ const quest = createQuest()
  const steps = ['creatureShown', 'search', 'itemShown', 'itemTaken', 'creatureShown', 'give'].map((event) => (quest.send(event) ? quest.step : `refused ${event}`))
  check('the whole quest goes through every step in order', steps.join(',') === 'asked,looking,itemThere,carrying,returned,done', steps.join(',')) }

{ const quest = createQuest()
  check('a new quest starts by looking for the creature', quest.step === 'meet')
  check('the item cannot be found or given before the creature has asked',
    !quest.send('itemShown') && !quest.send('itemTaken') && !quest.send('give') && !quest.send('search') && quest.step === 'meet') }

{ const quest = createQuest()
  ;['creatureShown', 'search', 'itemShown'].forEach((event) => quest.send(event))
  check('nothing can be given while the item has not been taken', !quest.send('give') && !quest.send('creatureShown') && quest.step === 'itemThere') }

{ const quest = createQuest()
  ;['creatureShown', 'search', 'itemShown', 'itemTaken', 'creatureShown', 'give'].forEach((event) => quest.send(event))
  check('a finished quest stays finished', !quest.send('give') && !quest.send('search') && !quest.send('creatureShown') && quest.step === 'done') }

check('prototype names are not events', ['constructor', 'toString', '__proto__'].every((event) => !createQuest().send(event)))

console.log(failures === 0 ? '\nALL QUEST CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures ? 1 : 0)
