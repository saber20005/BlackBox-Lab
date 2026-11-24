// Public discovery only. No account controller, notes, results, storage or analytics.
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  tracks: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  progress: '<path d="M4 20V10m8 10V4m8 16v-7"/><path d="m3 6 6-3 6 5 6-3"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
};
export function appIcon(name) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.tracks}</svg>`;
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ar').replace(/[\u064b-\u065f\u0670]/g, '').trim();

export function publicSearchItems(tracks, query = '', category = 'all') {
  const needle = normalize(query);
  const items = tracks.flatMap(track => [
    { kind: 'track', trackId: track.id, title: track.name, description: track.sub },
    ...track.stages.map((stage, index) => ({ kind: 'stage', trackId: track.id, stageIndex: index, title: stage.name, description: track.name, searchable: `${stage.goal} ${stage.guide}` })),
  ]);
  return items.filter(item => (category === 'all' || item.kind === category)
    && (!needle || normalize(`${item.title} ${item.description} ${item.searchable || ''}`).includes(needle)));
}

export function mountAppNavigation({ tracks, navigate, openTrack, openStage, canOpenStage, beforeOpen }) {
  const dialog = document.getElementById('bb-app-search');
  const input = document.getElementById('bb-app-search-input');
  const results = document.getElementById('bb-app-search-results');
  const count = document.getElementById('bb-app-search-count');
  let category = 'all';
  let opener;
  let previousOverflow = null;
  function update() {
    const items = publicSearchItems(tracks, input.value, category);
    count.textContent = input.value.trim() ? `${items.length} نتيجة من محتوى التدريب` : 'اختر مسارًا أو ابحث عن مرحلة';
    results.innerHTML = items.length ? items.slice(0, 20).map(item => {
      const locked = item.kind === 'stage' && !canOpenStage(item.trackId, item.stageIndex);
      return `<button type="button" class="bb-search-result" data-app-search-result data-track-id="${escape(item.trackId)}" ${item.kind === 'stage' ? `data-stage-index="${item.stageIndex}"` : ''} ${locked ? 'disabled' : ''}><span class="bb-search-result-icon">${appIcon(item.kind === 'track' ? 'tracks' : 'arrow')}</span><span><strong>${escape(item.title)}</strong><small>${escape(item.description)} · ${item.kind === 'track' ? 'المسار' : locked ? 'أكمل المرحلة السابقة' : 'مرحلة متاحة'}</small></span>${appIcon('arrow')}</button>`;
    }).join('') : '<div class="bb-search-empty"><strong>لا توجد نتائج مطابقة</strong><p>جرّب اسم مهارة مثل Nmap أو السجلات. البحث يشمل محتوى التدريب العام فقط.</p></div>';
    dialog.querySelectorAll('[data-app-search-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.appSearchCategory === category)));
  }
  function releaseScroll() {
    if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
    previousOverflow = null;
  }
  function close(restoreFocus = true) {
    if (!dialog.open) return;
    releaseScroll();
    dialog.close();
    if (restoreFocus && opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
  }
  function open(source) {
    if (document.body.classList.contains('bb-welcome-active') || document.querySelector('dialog[open]')) return;
    beforeOpen?.();
    opener = source;
    category = 'all'; input.value = ''; update();
    releaseScroll();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    input.focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-app-search-open]');
    if (trigger) open(trigger);
  });
  input.addEventListener('input', update);
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-app-search-close]')) { close(); return; }
    const chip = event.target.closest('[data-app-search-category]');
    if (chip) { category = chip.dataset.appSearchCategory; update(); return; }
    const result = event.target.closest('[data-app-search-result]');
    if (!result || result.disabled) return;
    const trackId = result.dataset.trackId;
    const stageIndex = result.hasAttribute('data-stage-index') ? Number(result.dataset.stageIndex) : null;
    close(false);
    if (stageIndex === null) openTrack(trackId);
    else openStage(trackId, stageIndex);
  });
  dialog.addEventListener('keydown', event => {
    // Search inputs can consume Escape to clear their value before native
    // dialog cancellation. One Escape should always dismiss discovery.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!dialog.open) releaseScroll(); });
  return { close, navigate, refresh: () => { if (dialog.open) update(); } };
}
