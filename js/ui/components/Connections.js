import { html } from '../html.js';
import { S } from '../strings.js';
import { href } from '../app/router.js';
import { layoutConnections } from '../../core/relationships.js';

const SIZE = 360;
const short = (s, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The connections diagram: inline SVG, the entity in the middle (SPEC 7, M7).
// The sentence list above it is the accessible version; this is a picture of it.
export function Connections({ entity, rels, byId }) {
  if (!rels.length) return null;
  const { nodes, edges, hidden } = layoutConnections(entity.id, rels, { size: SIZE });
  const at = new Map(nodes.map((n) => [n.id, n]));
  return html`
    <figure class="connections">
      <svg viewBox=${`0 0 ${SIZE} ${SIZE}`} role="img" aria-label=${S.rel.diagram(entity.name, nodes.length - 1)}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" class="connections-arrow" />
          </marker>
        </defs>
        ${edges.map((e, i) => {
          const a = at.get(e.from);
          const b = at.get(e.to);
          // Stop lines short of the node boxes so arrowheads stay visible.
          const [x1, y1, x2, y2] = trim(a, b, 24);
          const twin = edges.findIndex((o) => (o.from === e.to && o.to === e.from) || (o.from === e.from && o.to === e.to)) !== i;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 + (twin ? 12 : 0);
          return html`
            <g key=${e.id}>
              <line x1=${x1} y1=${y1} x2=${x2} y2=${y2} class="connections-edge" marker-end=${e.directed ? 'url(#arrow)' : undefined} />
              <text x=${mx} y=${my} class="connections-label" text-anchor="middle">${e.label}</text>
            </g>`;
        })}
        ${nodes.map((n) => {
          const e = byId.get(n.id);
          const name = e?.name ?? '';
          const w = Math.min(130, 16 + short(name).length * 7.2);
          return html`
            <a key=${n.id} href=${n.center ? undefined : href('entity', { id: n.id })} class=${`connections-node${n.center ? ' is-center' : ''}`}>
              <title>${name}</title>
              <rect x=${n.x - w / 2} y=${n.y - 14} width=${w} height="28" rx="3" />
              <text x=${n.x} y=${n.y + 5} text-anchor="middle">${short(name)}</text>
            </a>`;
        })}
      </svg>
      ${hidden > 0 && html`<figcaption class="muted">${S.rel.more(hidden)}</figcaption>`}
    </figure>`;
}

function trim(a, b, by) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(by / len, 0.4);
  return [a.x + dx * k, a.y + dy * k, b.x - dx * k, b.y - dy * k];
}
