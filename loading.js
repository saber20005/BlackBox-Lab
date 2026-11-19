// Startup feedback follows the first usable screen, independently of optional services.
(() => {
  const fontStyles = document.getElementById('bb-fonts');
  if (fontStyles) {
    const activateFonts = () => { fontStyles.media = 'all'; };
    fontStyles.addEventListener('load', activateFonts, { once: true });
    // A cached stylesheet may have loaded before this deferred script executes.
    if (fontStyles.sheet) activateFonts();
  }

  const indicator = document.getElementById('bb-load-indicator');
  if (!indicator) return;
  const needsWorkspace = indicator.dataset.loadingUntil === 'workspace';
  const logo = document.createElement('span');
  logo.className = 'bb-load-logo';
  logo.textContent = 'B.';
  logo.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'bb-load-copy';
  const title = document.createElement('strong');
  title.textContent = 'BLACKBOX';
  title.dir = 'ltr';
  const message = document.createElement('span');
  message.textContent = needsWorkspace ? 'جارٍ تجهيز مساحة التدريب…' : 'جارٍ تجهيز الصفحة…';
  copy.append(title, message);
  const activity = document.createElement('span');
  activity.className = 'bb-load-activity';
  activity.setAttribute('aria-hidden', 'true');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'bb-load-retry';
  retry.dataset.loadRetry = '';
  retry.textContent = 'إعادة المحاولة';
  retry.hidden = true;
  retry.addEventListener('click', () => window.location.reload());
  indicator.replaceChildren(logo, copy, activity, retry);
  indicator.dataset.state = 'loading';

  const workspaceReady = () => document.documentElement.dataset.bbAppReady === 'true'
    && document.documentElement.dataset.bbLandingReady === 'true';
  const finish = () => {
    indicator.dataset.state = 'ready';
    indicator.hidden = true;
  };
  const fail = () => {
    indicator.dataset.state = 'error';
    title.textContent = 'تعذّر تجهيز الصفحة';
    title.dir = 'rtl';
    message.textContent = 'أعد المحاولة لتحميل مساحة التدريب.';
    activity.hidden = true;
    retry.hidden = false;
    indicator.hidden = false;
  };
  const screenReady = () => { if (needsWorkspace && workspaceReady()) finish(); };
  const domReady = () => {
    // Static module scripts have finished (or failed) before DOMContentLoaded.
    if (!needsWorkspace || workspaceReady()) finish();
    else fail();
  };
  document.addEventListener('blackbox:screen-ready', screenReady);
  document.addEventListener('DOMContentLoaded', domReady, { once: true });
  window.addEventListener('pageshow', event => {
    if (event.persisted && (!needsWorkspace || workspaceReady())) finish();
  });

  if (needsWorkspace && workspaceReady()) finish();
  else if (document.readyState === 'complete') domReady();
  else indicator.hidden = false;
})();
