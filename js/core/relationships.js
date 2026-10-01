// Relationships as plain sentences (SPEC 3.5). Pure. M7 adds the rest.

export const SUGGESTED = [
  ['ally', false], ['rival', false], ['family', false], ['enemy', false],
  ['owes', true], ['member of', true], ['located in', true], ['works for', true],
];

const PLURAL = { ally: 'allies', rival: 'rivals', enemy: 'enemies', family: 'family', friend: 'friends' };

// An unknown type is one-way unless the record says otherwise (SPEC 3.5).
export function isDirected(rel) {
  if (typeof rel.directed === 'boolean') return rel.directed;
  const s = SUGGESTED.find(([t]) => t === rel.type);
  return s ? s[1] : true;
}

// "Lord Aldric Thorne works for Hollow King" / "Wren Ashdown and Lyra Ashdown are family"
export function sentence(rel, nameOf) {
  const a = nameOf(rel.from_id);
  const b = nameOf(rel.to_id);
  if (isDirected(rel)) return `${a} ${rel.type} ${b}`;
  return `${a} and ${b} are ${PLURAL[rel.type] ?? rel.type}`;
}
