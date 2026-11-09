import { tracks } from './data.js';

export const SITE_ORIGIN = 'https://blackboxlab.dev';
const HOME = `${SITE_ORIGIN}/`;
const VIEWS = new Set(['home', 'tracks', 'journal', 'backups', 'troubleshoot']);
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const trackById = id => tracks.find(track => track.id === id);
const defaultTrack = id => trackById(id)?.id || tracks[0].id;

function safeURL(input) {
  try {
    const url = new URL(input instanceof URL ? input.href : input, HOME);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

// Reading a link never changes progress or decides whether a stage is unlocked.
export function parseRoute(input, fallbackTrack = tracks[0].id) {
  const trackId = defaultTrack(fallbackTrack);
  const home = { view: 'home', trackId, stageIndex: 0, invalid: false };
  if (typeof input !== 'string' && !(input instanceof URL)) return { ...home, invalid: true };
  const url = safeURL(input);
  if (!url) return { ...home, invalid: true };
  const params = url.searchParams;
  if (['view', 'track', 'stage'].some(key => params.getAll(key).length > 1)) return { ...home, invalid: true };
  const selectedTrack = params.has('track') ? trackById(params.get('track')) : null;
  if (params.has('track') && !selectedTrack) return { ...home, invalid: true };

  const view = params.get('view');
  const invalidView = params.has('view') && !VIEWS.has(view);
  const route = {
    view: VIEWS.has(view) ? view : selectedTrack ? 'tracks' : 'home',
    trackId: selectedTrack?.id || trackId,
    stageIndex: 0,
    invalid: invalidView,
  };
  if (params.has('stage')) {
    const raw = params.get('stage');
    const index = /^(0|[1-9]\d*)$/.test(raw) ? Number(raw) : NaN;
    if (!selectedTrack || !Number.isSafeInteger(index) || !selectedTrack.stages[index]) {
      return { ...route, view: selectedTrack ? 'tracks' : 'home', invalid: true };
    }
    return { ...route, view: 'exercise', stageIndex: index };
  }
  return route;
}

// Keep campaign attribution through navigation; clean copies omit it explicitly.
export function routeURL(route, base = HOME, { preserveCampaign = true } = {}) {
  const url = safeURL(base) || new URL(HOME);
  const previous = new URLSearchParams(url.search);
  url.search = '';
  url.hash = '';
  if (preserveCampaign) {
    for (const key of CAMPAIGN_KEYS) {
      const value = previous.get(key)?.trim();
      if (value && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value)) url.searchParams.set(key, value);
    }
  }

  const track = trackById(route?.trackId);
  const stageIndex = route?.stageIndex;
  if (route?.view === 'exercise' && track && Number.isInteger(stageIndex) && track.stages[stageIndex]) {
    url.searchParams.set('track', track.id);
    url.searchParams.set('stage', String(stageIndex));
  } else if (route?.view === 'tracks' || route?.view === 'exercise') {
    url.searchParams.set('view', 'tracks');
    if (track) url.searchParams.set('track', track.id);
  } else if (VIEWS.has(route?.view) && route.view !== 'home') {
    url.searchParams.set('view', route.view);
  }
  return url;
}

// Stage URLs can depend on local progress, so their public canonical is the track.
export function canonicalURL(route) {
  if (route?.view === 'tracks' || route?.view === 'exercise') {
    return routeURL({ view: 'tracks', trackId: route.trackId }, HOME, { preserveCampaign: false }).href;
  }
  if (route?.view === 'troubleshoot') return `${HOME}?view=troubleshoot`;
  return HOME;
}

export function routeMetadata(route) {
  const track = trackById(route?.trackId);
  const stage = track?.stages[route?.stageIndex];
  const base = {
    title: 'BLACKBOX | مساحة التدريب السيبراني',
    description: 'مساحة تدريب عربية تضم 6 مسارات و18 مرحلة للمختبر المحلي، مع حفظ الملاحظات والتقدم والنسخ الاحتياطية والتقارير.',
    canonical: canonicalURL(route),
    shouldIndex: !['exercise', 'journal', 'backups'].includes(route?.view),
  };
  if (route?.view === 'exercise' && track && stage) {
    return { ...base, title: `${stage.name} | ${track.name} | BLACKBOX`, description: stage.goal };
  }
  if (route?.view === 'tracks') {
    return track
      ? { ...base, title: `${track.name} | مسارات BLACKBOX`, description: `${track.sub}. ثلاث مراحل متتابعة مع تدوين النتائج وحفظ تقدمك في المتصفح.` }
      : { ...base, title: 'مسارات التدريب | BLACKBOX' };
  }
  if (route?.view === 'troubleshoot') return { ...base, title: 'حلول أعطال المختبر | BLACKBOX', description: 'إرشادات عملية لحل أعطال المختبر المحلي والشبكة وأدوات التدريب، مع البحث في الحلول.' };
  if (route?.view === 'journal') return { ...base, title: 'سجل المختبر | BLACKBOX' };
  if (route?.view === 'backups') return { ...base, title: 'النسخ الاحتياطي والتقارير | BLACKBOX' };
  return base;
}
