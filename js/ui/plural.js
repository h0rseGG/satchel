// "1 note", "2 notes", "1 entity", "3 entities".
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function countsText({ notes, entities }) {
  return `${plural(notes, 'note')}, ${plural(entities, 'entity', 'entities')}`;
}
