// Every user-facing string lives here so wording can be tuned in one place (SPEC 5.4).
import { count } from './format.js';

export const S = {
  appName: 'Satchel',
  tagline: 'A satchel for one adventurer. Everything stays in this browser.',
  version: (v) => `Satchel v${v}`,

  nav: {
    home: 'Home', inbox: 'Inbox', notes: 'Notes', world: 'World', stubs: 'Stubs',
    character: 'My character', files: 'Files', settings: 'Settings',
    unknown: 'Not found', notFound: 'Page not found', crumbs: 'You are here',
  },

  menu: {
    open: 'Menu',
    packKit: 'Pack kit',
    unpackKit: 'Unpack kit',
    help: 'How it works',
    settings: 'Settings',
    newCharacter: 'New character',
  },

  session: {
    start: 'Start session',
    startShort: 'Session',
    inSession: 'In session',
    end: 'End session',
  },

  badge: {
    backedUp: 'Backed up',
    notBackedUp: 'Not backed up',
    changes: (n) => count(n, 'change'),
    sinceBackup: ' since backup',
    title: 'Pack a kit to back up',
  },

  firstRun: {
    title: 'Satchel',
    nameLabel: 'Your character’s name',
    start: 'Start',
  },

  common: {
    save: 'Save', cancel: 'Cancel', close: 'Close', delete: 'Delete', remove: (x) => `Remove ${x}`,
    search: 'Search', confirm: 'Confirm',
    typeToConfirm: (name) => `Type “${name}” to confirm`,
    dismiss: 'Dismiss message',
  },

  picker: {
    placeholder: 'Search or type a new name',
    newStub: (name) => `New stub: ${name}`,
    none: 'No matches',
  },

  chips: { add: 'Add' },

  later: (what) => `${what} arrives in a later build.`,
  notBuilt: 'This page isn’t built yet.',
  underConstruction: 'Satchel v2 is being built. Capture, the world and kits come next.',

  errors: {
    unexpected: 'Something went wrong. Your data is safe; try again.',
    invalid: {
      'not-a-number': 'Enter a number',
      'not-a-date': 'Enter a date like 2026-10-01',
      'not-a-url': 'Enter a web address starting with https://',
    },
  },
};
