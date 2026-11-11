// Me: settings entry point and app info. Levels, badges and charts arrive in Stage 5.

import { html, mount, onAction } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { VERSION } from '../version.js';

export async function render(el) {
  let persisted = false;
  try { persisted = await navigator.storage.persisted(); } catch { /* unsupported */ }

  mount(el, html`
    <header class="head"><div class="head-stack">
      <span class="label" style="font-size:17px">Fitness Tracker</span>
      <h1 class="title">Me</h1>
    </div></header>

    <div>
      <a class="rowlink" href="#/me/settings">
        <div class="tile" style="--c:var(--track);color:var(--text)">${icon('gear', 22)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:17px">Settings</span>
          <span class="body-2">Sleep goal, water, supplements</span>
        </div>
        <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
      </a>
      <button class="rowlink" data-action="update">
        <div class="tile" style="--c:var(--track);color:var(--text)">${icon('refresh', 22)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:17px">Update app</span>
          <span class="body-2">Fetch the newest version. Your data is not touched.</span>
        </div>
      </button>
    </div>

    <div class="coming" style="padding-top:8px">
      <p class="body-2">Levels, badges and progress charts arrive in Stage 5.</p>
      <p class="small">Version ${VERSION}</p>
      <p class="small">${persisted
        ? 'Storage is protected: iOS will not clear your data to free space.'
        : 'Data is saved on this device. Add the app to your Home Screen so iOS keeps it.'}</p>
    </div>`);

  onAction(el, {
    // Clear the offline file cache (not the data) and reload from the network.
    update: async (t) => {
      t.querySelector('.body-2').textContent = 'Updating...';
      try {
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.update();
      } catch { /* offline: just reload */ }
      location.reload();
    },
  });
}
