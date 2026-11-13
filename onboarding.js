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

const kaliToggle = document.getElementById('kali-details-toggle');
const kaliSteps = document.getElementById('kali-guide-steps');
kaliToggle?.addEventListener('click', () => {
  const expanded = kaliToggle.getAttribute('aria-expanded') === 'true';
  kaliToggle.setAttribute('aria-expanded', String(!expanded));
  kaliSteps.hidden = expanded;
});
function startWelcomeTour() {
  show();
  document.getElementById('welcome-tips')?.scrollIntoView({behavior:'smooth',block:'center'});
  const first = tips[0]?.querySelector('button');
  if (first && first.getAttribute('aria-expanded') !== 'true') first.click();
  first?.focus({preventScroll:true});
}
document.getElementById('welcome-tour')?.addEventListener('click',startWelcomeTour);
document.getElementById('welcome-tour-secondary')?.addEventListener('click',startWelcomeTour);
