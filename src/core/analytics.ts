// GA4 (gtag.js) transport. The script is injected lazily on the first tracked
// event, so a visitor who bounces off the landing page never pays for it.
//
// Analytics is OFF unless every one of these holds:
//   • import.meta.env.PROD          , dev and Vitest are dead code paths
//   • a well-formed G-XXXXXXXXXX id , see .env.production
//   • a hostname in PROD_HOSTS      , keeps forks, localhost and `vite preview` out
//   • no Global Privacy Control     , honours the browser-level opt-out
//
// On the measurement id: it is NOT a secret. It ships inlined in the bundle and
// is readable from the deployed page by anyone, which is why the hostname gate
// below , not secrecy , is what protects the property from stray reporting.
//
// Nothing in this module may ever throw into a caller. An editor that drops a
// knob turn because a metric failed is strictly worse than a missing metric, so
// every entry point is wrapped and every failure degrades to a silent no-op.
import type { AnalyticsEvent, AnalyticsParams } from './analyticsEvents';

const ID_SHAPE = /^G-[A-Z0-9]{4,}$/;
// Only the canonical apex. The legacy hosts (kabirtamari.com/gp200studio and
// gp200.afterhour.uk) now 301 here, so a page can never finish loading there.
const PROD_HOSTS = new Set(['gp200studio.com']);

/** Mirrors src/core/debugFlags.ts. Set to '1' in DevTools and reload to route
 *  events into GA4 DebugView:
 *    localStorage.setItem('gp200:debug:analytics', '1')  */
export const ANALYTICS_DEBUG_FLAG = 'gp200:debug:analytics';

// Hard ceiling on events per page session. The taxonomy emits well under 20, so
// this never binds in practice; it exists so that a future instrumentation bug
// (an effect firing in a render loop) costs a bounded amount of memory and
// bandwidth instead of growing without limit. Deliberately not a "detect the ad
// blocker" heuristic , gtag.js does not drain dataLayer, and a blocker serving
// an empty 200 still fires onload, so queue length proves nothing either way.
const MAX_EVENTS_PER_SESSION = 200;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let enabled: boolean | null = null;
let bootstrapped = false;
let sent = 0;
const onceKeys = new Set<string>();

/** Read lazily, not into a module-level const: Vite still replaces the
 *  expression statically at build time, and keeping it inside a function is
 *  what lets tests swap the value with vi.stubEnv after importing. */
function measurementId(): string {
  return import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';
}

/** Indirection rather than a bare `location`: jsdom's window.location is not
 *  assignable, so this is the only clean seam for vi.stubGlobal in tests. */
function hostname(): string {
  return globalThis.location?.hostname ?? '';
}

function debugMode(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_DEBUG_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Global Privacy Control , a browser/extension-level "do not sell or share"
 *  signal. Not in the DOM lib yet, hence the cast. */
function privacyControlOn(): boolean {
  const nav = globalThis.navigator as (Navigator & { globalPrivacyControl?: boolean }) | undefined;
  return nav?.globalPrivacyControl === true;
}

export function isAnalyticsEnabled(): boolean {
  enabled ??=
    import.meta.env.PROD &&
    ID_SHAPE.test(measurementId()) &&
    typeof document !== 'undefined' &&
    PROD_HOSTS.has(hostname()) &&
    !privacyControlOn();
  return enabled;
}

// gtag.js reads the pushed `arguments` OBJECT off dataLayer , a plain array is
// not equivalent for all downstream tag behaviour, so keep the canonical form.
function gtag() {
  // oxlint-disable-next-line prefer-rest-params
  window.dataLayer!.push(arguments);
}
const call = gtag as unknown as (...args: unknown[]) => void;

/** Injects gtag.js and sends the initial config. Returns false when analytics
 *  is off or the injection failed, in which case callers must do nothing. */
function bootstrap(): boolean {
  if (!isAnalyticsEnabled()) return false;
  if (bootstrapped) return true;
  bootstrapped = true;
  const id = measurementId();
  try {
    window.dataLayer ??= [];
    call('js', new Date());
    call('config', id, {
      // No Google Signals and no ad personalisation: this is product analytics,
      // not an advertising integration. Both must be off for the "disclose, no
      // consent banner" position in the README to be honest.
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true,
      ...(debugMode() ? { debug_mode: true } : {}),
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    // Most content blockers surface a network error here; stop queueing once we
    // know nothing will ever consume the queue.
    script.onerror = () => {
      enabled = false;
    };
    document.head.appendChild(script);
  } catch {
    // A CSP refusal or a sandboxed document lands here. Disable rather than throw.
    enabled = false;
    return false;
  }
  return true;
}

/** Clamp to GA4's per-param caps and drop empties. */
function sanitize(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [rawKey, value] of Object.entries(params)) {
    if (value === undefined || value === null || n >= 24) continue;
    out[rawKey.slice(0, 40)] = typeof value === 'string' ? value.slice(0, 100) : value;
    n++;
  }
  return out;
}

export function track<E extends AnalyticsEvent>(event: E, params?: AnalyticsParams[E]): void {
  if (!bootstrap()) return;
  if (sent >= MAX_EVENTS_PER_SESSION) return;
  sent++;
  try {
    call('event', event, sanitize(params as Record<string, unknown> | undefined));
  } catch {
    // Never break the app for a metric.
  }
}

/** Fire at most once per page session, keyed by `key` (e.g. `panel:looper`).
 *  Used wherever the interesting signal is reach rather than frequency. */
export function trackOnce<E extends AnalyticsEvent>(
  key: string,
  event: E,
  params?: AnalyticsParams[E],
): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  track(event, params);
}

/** Session-scoped dimensions attached to every subsequent event. */
export function setAnalyticsContext(props: Record<string, string | number | boolean>): void {
  if (!bootstrap()) return;
  try {
    call('set', 'user_properties', props);
  } catch {
    // no-op
  }
}

// There is deliberately no trackVirtualPageView() here any more. It existed
// because the guide was SPA state with no URL, so GA4 never saw it as a page.
// The guide is now a set of real prerendered documents, and bootstrap()'s
// `config` call sends an accurate page_view on each one for free.

/** Test seam: clears every piece of memoised module state. */
export function __resetAnalyticsForTests(): void {
  enabled = null;
  bootstrapped = false;
  sent = 0;
  onceKeys.clear();
  if (typeof window !== 'undefined') delete window.dataLayer;
}
