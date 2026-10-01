// Display names for entity types and the list pages (#/list/<key>).
// "stub" isn't a type: it lists entities still marked as stubs.
export const LIST_KEYS = ['npc', 'location', 'item', 'faction', 'character', 'other', 'stub'];

export const PLURAL = {
  npc: 'NPCs', location: 'Locations', item: 'Items', faction: 'Factions',
  character: 'Characters', other: 'Other', stub: 'Stubs',
};

// As a label (headings, dropdowns, cards).
export const TYPE_LABEL = {
  npc: 'NPC', location: 'Location', item: 'Item', faction: 'Faction',
  character: 'Character', other: 'Other', unknown: 'Stub',
};
export const typeLabel = (e) => (e.stub ? 'Stub' : TYPE_LABEL[e.type] ?? e.type);

// Inside sentences ("New location…").
export const SINGULAR = {
  npc: 'NPC', location: 'location', item: 'item', faction: 'faction',
  character: 'character', other: 'other', unknown: 'stub',
};

// Which list an entity belongs in. The player character isn't listed.
export function listKeyOf(entity) {
  return entity.stub ? 'stub' : entity.type;
}
