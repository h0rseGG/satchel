// Canonical JSON: keys sorted at every level, so the same data always gives the same
// bytes (v1 lesson 11: field-order differences broke byte comparisons). Pure.
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

export function canonicalJson(value, indent) {
  return JSON.stringify(sortKeys(value), null, indent);
}

export function sameValue(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}
