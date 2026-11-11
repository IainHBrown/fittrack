// Train > Stretches: your own stretch library with photos, filtered by category.

import { html, mount, onAction } from '../lib/dom.js';
import { getAll, putItem, deleteItem, newId } from '../db.js';
import { settings } from '../state.js';
import { icon } from '../ui/icons.js';
import { trainNav } from '../ui/trainnav.js';
import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

let filter = 'All';
let openId = null;

/** Shrink a photo to at most 1100 px on its long side and save it as a JPEG data URL. */
export function compressPhoto(file, maxSide = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo')); };
    img.src = url;
  });
}

function openStretchSheet(stretch, onDone) {
  const cats = settings().stretchCategories;
  const f = stretch
    ? { ...stretch }
    : { id: newId('st'), name: '', category: filter !== 'All' && cats.includes(filter) ? filter : cats[0], notes: '', photo: null, createdAt: Date.now() };

  openSheet(stretch ? 'Edit stretch' : 'New stretch', (body, close) => {
    function draw() {
      mount(body, html`
        <label class="photo-pick">
          ${f.photo ? html`<img src="${f.photo}" alt="Stretch photo">` : html`${icon('plus', 22, 2.6)} <span class="label-strong" style="font-size:17px">Add a photo</span>`}
          <input type="file" accept="image/*" id="st-photo" aria-label="Choose or take a photo">
        </label>
        ${f.photo ? html`<p class="small" style="margin-top:-10px">Tap the photo to replace it.</p>` : ''}
        <div class="form-field">
          <label class="label" for="st-name">Name</label>
          <input class="input input-wide" style="height:52px" id="st-name" type="text" maxlength="40" value="${f.name}" placeholder="e.g. Couch stretch">
        </div>
        <div class="form-field">
          <span class="label">Category</span>
          <div class="chips" style="--cols:3" data-group="category">
            ${cats.map((c) => html`<button class="chip" style="font-size:16px" data-action="cat" data-v="${c}" aria-pressed="${String(f.category === c)}">${c}</button>`)}
          </div>
        </div>
        <div class="form-field">
          <label class="label" for="st-notes">Notes · optional</label>
          <textarea class="input" id="st-notes" maxlength="400" placeholder="e.g. 2 x 45 s each side">${f.notes}</textarea>
        </div>
        <button class="btn" data-action="save">Save stretch</button>
        <div class="small flare" id="st-error" role="alert"></div>`);
    }
    const read = () => { f.name = body.querySelector('#st-name').value; f.notes = body.querySelector('#st-notes').value; };

    body.onchange = async (e) => {
      if (e.target.id !== 'st-photo' || !e.target.files[0]) return;
      read();
      try { f.photo = await compressPhoto(e.target.files[0]); } catch (err) { body.querySelector('#st-error').textContent = err.message; return; }
      draw();
    };
    onAction(body, {
      cat: (t) => { read(); f.category = t.dataset.v; draw(); },
      save: async () => {
        read();
        f.name = f.name.trim();
        f.notes = f.notes.trim();
        if (!f.name) { body.querySelector('#st-error').textContent = 'Give the stretch a name.'; return; }
        await putItem('stretches', f);
        close();
        toast(stretch ? 'Stretch updated' : 'Stretch added');
        onDone();
      },
    });
    draw();
  });
}

export async function render(el, ctx) {
  const cats = settings().stretchCategories;
  const all = (await getAll('stretches')).sort((a, b) => a.name.localeCompare(b.name));
  if (filter !== 'All' && !cats.includes(filter)) filter = 'All';
  const shown = all.filter((s) => filter === 'All' || s.category === filter);

  mount(el, html`
    <header class="head"><div class="head-stack">
      <span class="label" style="font-size:17px">${all.length} stretch${all.length === 1 ? '' : 'es'}</span>
      <h1 class="title">Train</h1>
    </div></header>
    ${trainNav('stretches')}

    <div class="fchips" role="group" aria-label="Filter by category">
      ${['All', ...cats].map((c) => html`<button class="fchip" data-action="filter" data-v="${c}" aria-pressed="${String(filter === c)}">${c}</button>`)}
    </div>

    <section>
      ${shown.length === 0 ? html`
        <div class="coming" style="padding:16px 4px">
          <p class="body-2">${all.length === 0
            ? 'No stretches yet. Add your own with a photo, a name and a category.'
            : `No stretches in ${filter} yet.`}</p>
        </div>` : ''}
      ${shown.map((s) => html`
        <div class="stretch">
          <button class="rowlink" data-action="toggle" data-id="${s.id}" aria-expanded="${String(openId === s.id)}">
            ${s.photo ? html`<img class="stretch-thumb" src="${s.photo}" alt="">` : html`<div class="stretch-thumb empty">${icon('me', 24)}</div>`}
            <div class="rowlink-main">
              <span class="label-strong" style="font-size:19px">${s.name}</span>
              <span class="label">${s.category}</span>
            </div>
            <span style="color:var(--ash);transform:rotate(${openId === s.id ? 90 : 0}deg);transition:transform 0.2s">${icon('right', 18, 2.4)}</span>
          </button>
          ${openId === s.id ? html`
            <div class="stretch-body">
              ${s.photo ? html`<img class="stretch-photo" src="${s.photo}" alt="${s.name}">` : ''}
              ${s.notes ? html`<p class="body-2" style="font-size:15px;white-space:pre-line">${s.notes}</p>` : ''}
              <div class="btn-row">
                <button class="btn btn-ghost" data-action="edit" data-id="${s.id}">Edit</button>
                <button class="btn btn-ghost" data-action="delete" data-id="${s.id}">Delete</button>
              </div>
            </div>` : ''}
        </div>`)}
    </section>

    <button class="btn" data-action="add">${icon('plus', 22, 3)} Add stretch</button>
  `);

  onAction(el, {
    filter: (t) => { filter = t.dataset.v; openId = null; ctx.refresh(); },
    toggle: (t) => { openId = openId === t.dataset.id ? null : t.dataset.id; ctx.refresh(); },
    add: () => openStretchSheet(null, () => ctx.refresh()),
    edit: (t) => openStretchSheet(all.find((s) => s.id === t.dataset.id), () => ctx.refresh()),
    delete: async (t) => {
      // two taps to delete
      if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = 'Tap again to delete'; t.style.color = 'var(--flare)'; return; }
      await deleteItem('stretches', t.dataset.id);
      openId = null;
      ctx.refresh();
    },
  });
}
