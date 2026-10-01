// Hash routes (SPEC 5.1). Pure, so Node tests cover it: the back button works and GitHub Pages needs no server rules.
const ROUTES = [
  ['home', /^\/?$/],
  ['inbox', /^\/inbox$/],
  ['notes', /^\/notes$/],
  ['world', /^\/world$/],
  ['stubs', /^\/world\/stubs$/],
  ['type', /^\/world\/([^/]+)$/, ['typeId']],
  ['entity', /^\/entity\/([^/]+)$/, ['id']],
  ['character', /^\/character$/],
  ['files', /^\/files$/],
  ['file', /^\/files\/([^/]+)$/, ['id']],
  ['settings', /^\/settings$/],
  ['gallery', /^\/dev\/gallery$/],
];

// "#/world/npc?x=1" -> { name: 'type', params: { typeId: 'npc' }, query: { x: '1' } }
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [name, re, keys = []] of ROUTES) {
    const m = path.match(re);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query };
  }
  return { name: 'notfound', params: {}, query };
}

export function href(name, params = {}, query = {}) {
  const p = {
    home: '/', inbox: '/inbox', notes: '/notes', world: '/world', stubs: '/world/stubs',
    type: `/world/${encodeURIComponent(params.typeId)}`, entity: `/entity/${encodeURIComponent(params.id)}`,
    character: '/character', files: '/files', file: `/files/${encodeURIComponent(params.id)}`,
    settings: '/settings', gallery: '/dev/gallery',
  }[name];
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  return `#${p}${qs ? `?${qs}` : ''}`;
}

// Breadcrumbs after Home: [{ label, href? }]; the last one is the current page (no link).
// look: { typeLabel(typeId) -> plural, entity(id) -> record | null, file(id), S }
export function crumbs(route, look) {
  const { S } = look;
  const world = { label: S.nav.world, href: href('world') };
  switch (route.name) {
    case 'home': return [];
    case 'inbox': return [{ label: S.nav.inbox }];
    case 'notes': return [{ label: S.nav.notes }];
    case 'world': return [{ label: S.nav.world }];
    case 'stubs': return [world, { label: S.nav.stubs }];
    case 'type': return [world, { label: look.typeLabel(route.params.typeId) ?? S.nav.unknown }];
    case 'entity': {
      const e = look.entity(route.params.id);
      if (!e) return [world, { label: S.nav.unknown }];
      const parent = e.stub || !e.type_id
        ? { label: S.nav.stubs, href: href('stubs') }
        : { label: look.typeLabel(e.type_id) ?? S.nav.unknown, href: href('type', { typeId: e.type_id }) };
      return [world, parent, { label: e.name }];
    }
    case 'character': return [{ label: S.nav.character }];
    case 'files': return [{ label: S.nav.files }];
    case 'file': return [{ label: S.nav.files, href: href('files') }, { label: look.file(route.params.id)?.name ?? S.nav.unknown }];
    case 'settings': return [{ label: S.nav.settings }];
    case 'gallery': return [{ label: 'Component gallery' }];
    default: return [{ label: S.nav.notFound }];
  }
}
