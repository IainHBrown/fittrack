// Tiny HTML templating helpers. `html` escapes every interpolated value
// unless it is another `html` result or wrapped in `raw()`.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return new Raw(out);
}

/** Replace an element's content with an `html` result. */
export function mount(el, content) {
  el.innerHTML = String(content);
}

/**
 * One click listener per container: buttons carry data-action="name" and the
 * matching handler receives (element, event).
 */
export function onAction(el, handlers) {
  el.onclick = (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || !el.contains(t)) return;
    const fn = handlers[t.dataset.action];
    if (fn) fn(t, e);
  };
}
