const SITE = "BlackBoxLab";
const PRODUCTION_HOSTS = ["blackboxlab.dev", "www.blackboxlab.dev", "blackbox-lab-pied.vercel.app"];
const CASE_IDS = new Set(["INC-0417", "INC-0512", "INC-0633", "INC-0701", "INC-0755", "INC-0812", "INC-0890", "INC-0944", "INC-1002", "INC-1055", "INC-1101", "INC-1102", "INC-1103", "INC-1104", "INC-1105", "INC-1106", "INC-1201", "INC-1202", "INC-1203", "INC-1204", "INC-1205", "INC-1206", "INC-1207", "INC-1208", "INC-1209", "INC-1210", "INC-1211", "INC-1212"]);
const TRACK_IDS = new Set(["recon", "nmap", "network", "webgoat", "proxy", "metasploit"]);
const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const identifier = value => typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/i.test(value);
const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
const eventFields = {
  training_start: { case_id: value => CASE_IDS.has(value), difficulty: value => ["beginner", "intermediate", "advanced"].includes(value), source: identifier },
  training_complete: { case_id: value => CASE_IDS.has(value), score: value => integer(value, 70) },
  track_open: { track_id: value => TRACK_IDS.has(value) },
  stage_start: { track_id: value => TRACK_IDS.has(value), stage_index: value => integer(value, 2) },
  stage_complete: { track_id: value => TRACK_IDS.has(value), stage_index: value => integer(value, 2) },
  partner_click: { destination: value => ["cybertrace", "blackbox", "blackbox-lab"].includes(value), context: identifier },
  report_export: { format: value => value === "markdown" },
  backup_export: { format: value => value === "json" },
  backup_restore: { completed_count: value => integer(value, 18) },
};
const requiredFields = {
  training_start: ["case_id"], training_complete: ["case_id", "score"], track_open: ["track_id"],
  stage_start: ["track_id", "stage_index"], stage_complete: ["track_id", "stage_index"],
  partner_click: ["destination"], report_export: ["format"], backup_export: ["format"], backup_restore: [],
};

function safeEvent(name, properties) {
  if (!Object.hasOwn(eventFields, name)) return null;
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) return null;
  const safe = {};
  for (const [key, valid] of Object.entries(eventFields[name])) {
    if (Object.hasOwn(properties, key) && valid(properties[key])) safe[key] = properties[key];
  }
  return requiredFields[name].every(key => Object.hasOwn(safe, key)) ? safe : null;
}

function safeLocation(value, site) {
  const source = new URL(value);
  const target = new URL(source.origin + source.pathname);
  const view = source.searchParams.get("view");
  const views = site === "CyberTrace" ? ["home", "library", "auth"] : ["home", "tracks", "journal", "backups", "troubleshoot"];
  if (views.includes(view)) target.searchParams.set("view", view);
  if (site === "CyberTrace") {
    const caseId = source.searchParams.get("case");
    if (CASE_IDS.has(caseId)) target.searchParams.set("case", caseId);
  } else {
    const trackId = source.searchParams.get("track");
    if (TRACK_IDS.has(trackId)) {
      target.searchParams.set("track", trackId);
      const stage = source.searchParams.get("stage");
      if (/^[0-2]$/.test(stage ?? "")) target.searchParams.set("stage", stage);
    }
  }
  for (const key of CAMPAIGN_KEYS) {
    const campaign = source.searchParams.get(key);
    if (typeof campaign === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(campaign)) target.searchParams.set(key, campaign);
  }
  return target.href;
}

function safeReferrer(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin + url.pathname : "";
  } catch { return ""; }
}

/** Optional GA4 adapter. A valid owner's ID and an allowed production host are required. */
export function createAnalytics(options = {}) {
  let win, doc, nav;
  try {
    win = options.window ?? globalThis.window;
    doc = options.document ?? win?.document;
    nav = options.navigator ?? win?.navigator;
  } catch {
    return { trackEvent: () => false, trackPageView: () => false };
  }
  const site = options.site === "BlackBoxLab" || options.site === "CyberTrace" ? options.site : SITE;
  const allowedHosts = new Set(options.allowedHosts ?? PRODUCTION_HOSTS);
  let activeId = null;
  let initialized = false;
  let failed = false;
  let lastPage = null;

  function ready() {
    try {
      if (!win || !doc || failed) return false;
      if (nav?.globalPrivacyControl === true || [nav?.doNotTrack, nav?.msDoNotTrack, win.doNotTrack].some(value => [true, 1, "1", "yes"].includes(value))) return false;
      const location = new URL(win.location.href);
      if (location.protocol !== "https:" || !allowedHosts.has(location.hostname)) return false;
      const meta = doc.querySelector?.('meta[name="google-analytics-id"]');
      const id = String(options.measurementId ?? meta?.getAttribute?.("content") ?? meta?.content ?? "").trim();
      if (!/^G-[A-Z0-9]{6,20}$/.test(id) || win[`ga-disable-${id}`] === true) return false;
      if (initialized) return activeId === id;
      if (win.dataLayer !== undefined && !Array.isArray(win.dataLayer)) return false;
      if (win.gtag !== undefined && typeof win.gtag !== "function") return false;
      const scriptId = `training-analytics-${id}`;
      const existing = doc.getElementById?.(scriptId);
      if (!existing) {
        const script = doc.createElement("script");
        script.id = scriptId;
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
        script.onerror = () => { failed = true; };
        doc.head.appendChild(script);
      }
      win.dataLayer ??= [];
      win.gtag ??= function () { win.dataLayer.push(arguments); };
      activeId = id;
      initialized = true;
      win.gtag("js", new Date());
      win.gtag("config", id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: safeLocation(win.location.href, site),
        page_referrer: safeReferrer(doc.referrer),
      });
      return true;
    } catch {
      failed = true;
      return false;
    }
  }

  function send(name, properties) {
    try {
      if (!ready()) return false;
      win.gtag("event", name, {
        ...properties,
        site,
        send_to: activeId,
        page_location: safeLocation(win.location.href, site),
        page_referrer: safeReferrer(doc.referrer),
      });
      return true;
    } catch {
      failed = true;
      return false;
    }
  }

  return {
    trackEvent(name, properties = {}) {
      try {
        const safe = safeEvent(name, properties);
        return safe !== null && send(name, safe);
      } catch { return false; }
    },
    trackPageView() {
      try {
        if (!ready()) return false;
        const location = safeLocation(win.location.href, site);
        if (lastPage === location) return false;
        if (!send("page_view", { page_title: String(doc.title ?? "").slice(0, 200) })) return false;
        lastPage = location;
        return true;
      } catch { return false; }
    },
  };
}

const analytics = createAnalytics();
export const trackEvent = (name, properties) => analytics.trackEvent(name, properties);
export const trackPageView = () => analytics.trackPageView();
