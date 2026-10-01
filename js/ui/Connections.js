import { html } from './html.js';
import { href } from './router.js';

// Wide enough that names on the left and right sides fit (they're also
// shortened to 12 characters there; top and bottom names get 16).
const W = 480;
const H = 300;
const CX = W / 2;
const CY = H / 2;
const RX = 130;
const RY = 100;
const MAX = 12;
const short = (s, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A small diagram of one entity's relationships: it sits in the middle, the
// others around it, each line labelled with the relationship type; one-way
// relationships get an arrow. Plain inline SVG, no library. Names link to
// their pages. The list under it carries the same information as text.
export function Connections({ entity, rels, names, pcId }) {
  // Group by the other entity, so two relationships with the same one share a line.
  const byOther = new Map();
  for (const r of rels) {
    const other = r.from_id === entity.id ? r.to_id : r.from_id;
    if (!byOther.has(other)) byOther.set(other, []);
    byOther.get(other).push(r);
  }
  const others = [...byOther.keys()].sort((a, b) => names.get(a).localeCompare(names.get(b)));
  if (!others.length) return null;
  const shown = others.slice(0, MAX);
  const markerId = `arrow-${entity.id}`;
  const link = (id) => href(id === pcId ? '/character' : `/entity/${id}`);
  const label = `Connections of ${entity.name}: ${shown.map((id) => names.get(id)).join(', ')}`;

  const nodes = shown.map((id, i) => {
    // Spread evenly round an ellipse, starting at the top.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / shown.length;
    const x = CX + RX * Math.cos(angle);
    const y = CY + RY * Math.sin(angle);
    const list = byOther.get(id);
    const out = list.some((r) => r.directed && r.from_id === entity.id);
    const into = list.some((r) => r.directed && r.to_id === entity.id);
    // Stop lines short of the centre box and the node dot.
    const dx = x - CX;
    const dy = y - CY;
    const len = Math.hypot(dx, dy);
    const x1 = CX + (dx / len) * 34;
    const y1 = CY + (dy / len) * 18;
    const x2 = x - (dx / len) * 9;
    const y2 = y - (dy / len) * 9;
    return {
      id, x, y, x1, y1, x2, y2, out, into,
      text: list.map((r) => r.type).join(', '),
      anchor: Math.abs(dx) < 20 ? 'middle' : dx > 0 ? 'start' : 'end',
    };
  });

  return html`
    <figure class="connections">
      <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label}>
        <defs>
          <marker id=${markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" class="connections__arrow" />
          </marker>
        </defs>
        ${nodes.map((n) => html`
          <g key=${n.id}>
            <line class="connections__line" x1=${n.x1} y1=${n.y1} x2=${n.x2} y2=${n.y2}
              marker-end=${n.out ? `url(#${markerId})` : null} marker-start=${n.into ? `url(#${markerId})` : null} />
            <text class="connections__type" x=${(n.x1 + n.x2) / 2} y=${(n.y1 + n.y2) / 2 - 4} text-anchor="middle">${short(n.text, 18)}</text>
            <a href=${link(n.id)}>
              <circle class="connections__dot" cx=${n.x} cy=${n.y} r="6" />
              <text class="connections__name" x=${n.x + (n.anchor === 'start' ? 10 : n.anchor === 'end' ? -10 : 0)}
                y=${n.y + (n.anchor === 'middle' ? (n.y < CY ? -12 : 20) : 4)} text-anchor=${n.anchor}>${short(names.get(n.id), n.anchor === 'middle' ? 16 : 12)}</text>
              <title>${names.get(n.id)}: ${n.text}</title>
            </a>
          </g>`)}
        <rect class="connections__centre" x=${CX - 60} y=${CY - 16} width="120" height="32" rx="3" />
        <text class="connections__self" x=${CX} y=${CY + 5} text-anchor="middle">${short(entity.name, 15)}</text>
      </svg>
      ${others.length > MAX && html`<figcaption class="muted">+${others.length - MAX} more in the list below</figcaption>`}
    </figure>
  `;
}
