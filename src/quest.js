// The steps of a fetch quest in the scanner: a creature asks for something, the visitor finds it
// at another object, takes it and brings it back. Pure (no DOM, no Three.js), so it is tested in
// Node; scan.js shows what each step looks like.

/**
 * 'meet'      looking for the creature's own object;
 * 'asked'     the creature is there and has asked for the item;
 * 'looking'   looking for the object the item is at;
 * 'itemThere' the item is in view, to be tapped;
 * 'carrying'  the visitor has the item and is looking for the creature again;
 * 'returned'  the creature is back, waiting to be given the item;
 * 'done'      given.
 *
 * @typedef {'meet' | 'asked' | 'looking' | 'itemThere' | 'carrying' | 'returned' | 'done'} QuestStep
 */

/** What can happen in each step, and the step it leads to. */
const NEXT = {
  meet: {creatureShown: 'asked'},
  asked: {search: 'looking'},
  looking: {itemShown: 'itemThere'},
  itemThere: {itemTaken: 'carrying'},
  carrying: {creatureShown: 'returned'},
  returned: {give: 'done'},
  done: {},
}

/**
 * A new quest at its first step. Progress lives only as long as the page.
 *
 * @returns {{readonly step: QuestStep, send: (event: string) => boolean}} `send` moves on and
 *   returns true if the event belongs to the current step; otherwise nothing changes.
 */
export const createQuest = () => {
  let step = 'meet'
  return {
    get step() {
      return step
    },
    send(event) {
      if (!Object.hasOwn(NEXT[step], event)) {
        return false
      }
      step = NEXT[step][event]
      return true
    },
  }
}
