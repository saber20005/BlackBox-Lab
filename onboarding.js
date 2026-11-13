const key = 'blackbox-onboarding-dismissed-v1';
const section = document.getElementById('welcome-guide');
const close = document.getElementById('welcome-dismiss');
const reopen = document.getElementById('welcome-reopen');
const tips = [...document.querySelectorAll('[data-guide-tip]')];
const show = () => { section.hidden = false; reopen.hidden = true; };
const hide = () => { section.hidden = true; reopen.hidden = false; try { localStorage.setItem(key, '1'); } catch {} };
try { if (localStorage.getItem(key) === '1') hide(); } catch {}
close?.addEventListener('click', hide);
reopen?.addEventListener('click', show);
for (const tip of tips) {
  const trigger = tip.querySelector('button');
  const body = tip.querySelector('.guide-tip-body');
  trigger?.addEventListener('click', () => {
    const expanded = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
  });
}
document.querySelectorAll('[data-guide-nav]').forEach(button => button.addEventListener('click', () => {
  const target = document.querySelector('[data-view="' + button.dataset.guideNav + '"]');
  target?.click();
}));
