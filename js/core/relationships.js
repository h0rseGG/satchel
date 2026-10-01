// Relationships as plain sentences (SPEC 3.5). Pure. M7 adds the rest.

export const SUGGESTED = [
  ['ally', false], ['rival', false], ['family', false], ['enemy', false],
  ['owes', true], ['member of', true], ['located in', true], ['works for', true],
];

const PLURAL = { ally: 'allies', rival: 'rivals', enemy: 'enemies', family: 'family', friend: 'friends' };

// "are allies": how a both-ways type reads in a sentence.
export const bothWays = (type) => PLURAL[type] ?? type;

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
  return `${a} and ${b} are ${bothWays(rel.type)}`;
}

// Layout for the connections diagram (SPEC 7: inline SVG, at most 12 nodes): the entity
// in the middle, its direct connections round it, most recently edited first.
// rels: live relationships touching centerId. Returns { nodes, edges, hidden }.
export function layoutConnections(centerId, rels, { maxNodes = 12, size = 360 } = {}) {
  const c = size / 2;
  const others = [];
  for (const r of [...rels].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))) {
    const other = r.from_id === centerId ? r.to_id : r.from_id;
    if (other !== centerId && !others.includes(other)) others.push(other);
  }
  const shown = others.slice(0, maxNodes - 1);
  const radius = size * 0.36;
  const nodes = [{ id: centerId, x: c, y: c, center: true }];
  shown.forEach((id, i) => {
    // Start at the top and go clockwise.
    const a = -Math.PI / 2 + (2 * Math.PI * i) / shown.length;
    nodes.push({ id, x: round(c + radius * Math.cos(a)), y: round(c + radius * Math.sin(a)), center: false });
  });
  const edges = rels
    .filter((r) => shown.includes(r.from_id === centerId ? r.to_id : r.from_id))
    .map((r) => ({ id: r.id, from: r.from_id, to: r.to_id, label: r.type, directed: isDirected(r) }));
  return { nodes, edges, hidden: others.length - shown.length };
}

const round = (n) => Math.round(n * 10) / 10;
