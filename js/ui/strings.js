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

  capture: {
    label: 'Note',
    placeholderIn: 'Type and press Enter. @ to mention, # to tag.',
    placeholderOut: 'Quick note: goes to your Inbox. @ to mention, # to tag.',
    suggestions: 'Suggestions',
    newStub: (name) => `New stub: ${name}`,
    results: 'Results',
    saved: 'Saved to your Inbox.',
  },

  recall: {
    mentions: (n) => count(n, 'mention'),
    firstMention: 'First mention:',
    link: 'Link',
    linkLabel: (name) => `Turn “${name}” into a mention`,
    stub: 'stub',
    setType: (name) => `Set a type for ${name}`,
    typeSet: (name, type) => `${name}: type set to ${type}.`,
  },

  feed: {
    label: 'This session',
    empty: 'Your satchel is light. Type below and press Enter.',
  },

  overview: {
    open: 'Character overview',
    close: 'Back to notes',
    dndbeyond: 'Open in D&D Beyond',
    sections: {
      concept: 'Concept', backstory: 'Backstory', personality: 'Personality', ideals: 'Ideals', bonds: 'Bonds',
      flaws: 'Flaws', goals: 'Goals', appearance: 'Appearance', notes: 'Notes',
    },
    empty: 'Nothing written yet. Fill in your character page after the session.',
  },

  home: {
    inbox: 'Inbox',
    world: 'World',
    recent: 'Recent notes',
    allNotes: 'All notes',
    seeAll: 'See all',
    noNotes: 'Your satchel is light. Type below and press Enter.',
  },

  autoEnd: 'Session ended: nothing written for 12 hours.',

  character: {
    title: 'My character',
    basics: 'Basics',
    profile: 'Profile',
    dndbeyond: 'D&D Beyond link',
    dndbeyondHint: 'Your character sheet on D&D Beyond, e.g. https://www.dndbeyond.com/characters/12345678',
    open: 'Open in D&D Beyond',
    page: 'Character page',
    noConcept: 'Add a one-line concept on your character page.',
  },

  portrait: {
    add: 'Add picture',
    change: 'Change picture',
    remove: 'Remove picture',
    none: 'No picture',
    alt: (name) => `Picture of ${name}`,
    saved: 'Picture saved.',
  },

  upload: {
    'too-big': 'That file is over 10 MB.',
    empty: 'That file is empty.',
    unsupported: 'Satchel takes images, and .txt or .md text files.',
    'not-image': 'Pictures must be images.',
    'not-utf8': 'That text file isn’t plain UTF-8 text.',
    unreadable: 'That image couldn’t be read.',
  },

  note: {
    edit: 'Edit',
    editLabel: 'Edit note',
    save: 'Save',
    delete: 'Delete…',
    confirmDelete: 'Delete this note?',
    confirmDeleteBody: 'You can’t undo this.',
    deleted: 'Note deleted.',
    edited: 'edited',
    original: 'First version:',
    modeIn: 'in session',
    modeOut: 'out of session',
  },

  inbox: {
    title: 'Inbox',
    empty: 'Nothing loose. Every page is filed.',
    count: (n) => count(n, 'new note'),
    newNotes: (n) => (n === 1 ? 'new note' : 'new notes'),
    sortThem: 'Sort them →',
    filter: 'Show',
    all: 'All', in: 'In session', out: 'Out of session',
    keep: 'Keep as log',
    addTo: (name) => `Add to ${name}`,
    addToMe: 'Add to my character',
    section: 'Section',
    addRel: 'Add as relationship',
    relFrom: 'Who',
    relType: 'Relationship',
    relOther: 'Other…',
    relOtherLabel: 'Relationship (your words)',
    relWith: 'With',
    markAll: 'Mark all as log',
    showSorted: 'Show sorted',
    hideSorted: 'Hide sorted',
    sortedTitle: 'Sorted',
    back: 'Back to inbox',
    added: (name) => `Added to ${name}.`,
    kept: (n) => `${count(n, 'note')} kept as log.`,
    relAdded: 'Relationship added.',
  },

  notes: {
    title: 'Notes',
    filterText: 'Search notes',
    tag: 'Tag',
    anyTag: 'Any tag',
    mode: 'Written',
    entity: 'Mentions',
    anyone: 'Anyone',
    clear: 'Clear filters',
    none: 'No notes match.',
    more: (n) => `Show ${n} more`,
    shown: (a, b) => `${a} of ${count(b, 'note')}`,
  },

  world: {
    title: 'World',
    stubs: 'Stubs',
    stubsHint: 'Names you mentioned that have no type yet.',
    empty: 'No people or places yet. Mention someone with @ and they appear here.',
    manage: 'Manage types',
    addType: 'Add type',
    typeLabel: 'Name (one)',
    typePlural: 'Name (many)',
    person: 'People (they get short names, like “Grimbold” for Grimbold Ironhand)',
    edit: 'Edit',
    done: 'Done',
    fields: 'Fields',
    noFields: 'No fields yet.',
    addField: 'Add field',
    fieldLabel: 'Field name',
    fieldKind: 'Kind',
    linkTo: 'Links to',
    anyType: 'Anything',
    remove: 'Remove',
    removeField: (f) => `Remove field ${f}`,
    kinds: { text: 'Text', long_text: 'Long text', number: 'Number', date: 'Date', link: 'Link', url: 'Web address' },
    deleteType: 'Delete type…',
    moveTo: (n) => `Move its ${n} to`,
    builtin: 'Built-in: can be renamed, not deleted.',
    confirmDeleteType: (label) => `Delete the ${label} type?`,
    confirmDeleteTypeBody: (n, to) => (n ? `${n} move to ${to}. ` : '') + 'Its fields go with it.',
    typeDeleted: (label) => `${label} deleted.`,
  },

  typeList: {
    filter: 'Filter by name, alias, tag or field',
    add: (label) => `Add ${label}`,
    name: 'Name',
    none: 'Nothing here yet.',
    noMatch: 'Nothing matches.',
    setType: 'Set type',
    chooseType: 'Choose a type…',
  },

  entity: {
    name: 'Name',
    type: 'Type',
    stubType: 'Stub (no type yet)',
    tags: 'Tags',
    aliases: 'Also known as',
    summary: 'Summary (one line, shown on recall cards)',
    body: 'Description',
    notes: 'Notes that mention them',
    noNotes: 'Not mentioned in any note yet.',
    more: 'More',
    merge: 'Merge into…',
    mergeLabel: 'Merge into',
    confirmMerge: (a, b) => `Merge ${a} into ${b}?`,
    confirmMergeBody: (a, b) => `Notes, relationships and files move to ${b}. “${a}” becomes one of ${b}’s aliases. You can’t undo this.`,
    merged: (a, b) => `${a} merged into ${b}.`,
    delete: 'Delete…',
    confirmDelete: (a) => `Delete ${a}?`,
    confirmDeleteBody: 'Notes that mention them keep the name as plain text. You can’t undo this.',
    deleted: (a) => `${a} deleted.`,
    gone: 'This entry was deleted.',
    openLink: 'Open',
    change: 'Change',
    clear: 'Clear',
    pickLink: (label) => `Choose ${label}`,
  },

  count: (n, one, many) => count(n, one, many),

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
      dndbeyond: 'Paste a link from dndbeyond.com or ddb.ac (starting with https://)',
    },
  },
};
