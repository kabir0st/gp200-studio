import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  track,
  trackOnce,
  isAnalyticsEnabled,
  setAnalyticsContext,
  __resetAnalyticsForTests,
} from '@/core/analytics';
import { msBucket, errorCode } from '@/core/analyticsEvents';

/** dataLayer holds `arguments` objects, not arrays — spread each to inspect. */
function calls(): unknown[][] {
  return [...(window.dataLayer ?? [])].map((a) => [...(a as IArguments)]);
}

function gtagScripts(): NodeListOf<Element> {
  return document.querySelectorAll('script[src*="googletagmanager"]');
}

/** Put the module in the one state where analytics is live. */
function enableProd(hostname = 'kabirtamari.com') {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TESTID123');
  vi.stubGlobal('location', { hostname, origin: `https://${hostname}` });
  __resetAnalyticsForTests();
}

beforeEach(() => {
  __resetAnalyticsForTests();
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('analytics: off in dev and test', () => {
  it('reports disabled, injects no script and creates no dataLayer', () => {
    expect(isAnalyticsEnabled()).toBe(false);

    track('app_open', { ui_mode: 'desktop', webmidi: true });
    track('view_change', { view: 'board' });

    expect(gtagScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });
});

describe('analytics: production gating', () => {
  it('stays off on localhost even in a PROD build', () => {
    enableProd('localhost');
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('stays off on a fork host that is not in PROD_HOSTS', () => {
    enableProd('someone-elses-fork.pages.dev');
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('stays off when the measurement id is missing', () => {
    enableProd();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    __resetAnalyticsForTests();
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('stays off when the measurement id is malformed', () => {
    enableProd();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'UA-12345-1');
    __resetAnalyticsForTests();
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('stays off when the browser sends Global Privacy Control', () => {
    enableProd();
    vi.stubGlobal('navigator', { ...navigator, globalPrivacyControl: true });
    __resetAnalyticsForTests();
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('turns on for a production host with a well-formed id', () => {
    enableProd();
    expect(isAnalyticsEnabled()).toBe(true);
  });
});

describe('analytics: bootstrap', () => {
  it('injects gtag.js exactly once across several events', () => {
    enableProd();

    track('app_open', { ui_mode: 'phone', webmidi: false });
    track('view_change', { view: 'guide' });
    track('nav_tab', { tab: 'loop' });

    expect(gtagScripts()).toHaveLength(1);
    expect(gtagScripts()[0].getAttribute('src')).toContain('id=G-TESTID123');
  });

  it('configures GA4 with signals and ad personalisation disabled', () => {
    enableProd();
    track('app_open', { ui_mode: 'desktop', webmidi: true });

    const config = calls().find((c) => c[0] === 'config');
    expect(config).toBeDefined();
    expect(config![1]).toBe('G-TESTID123');
    expect(config![2]).toMatchObject({
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true,
    });
  });

  it('sends the event name and params through to dataLayer', () => {
    enableProd();
    track('editor_open', { entry: 'device', ui_mode: 'desktop' });

    const event = calls().find((c) => c[0] === 'event' && c[1] === 'editor_open');
    expect(event).toBeDefined();
    expect(event![2]).toEqual({ entry: 'device', ui_mode: 'desktop' });
  });

  it('does not inject a second script for setAnalyticsContext', () => {
    enableProd();
    setAnalyticsContext({ ui_mode: 'desktop', webmidi: true });
    track('app_open', { ui_mode: 'desktop', webmidi: true });

    expect(gtagScripts()).toHaveLength(1);
    expect(calls().find((c) => c[0] === 'set')).toBeDefined();
  });
});

describe('analytics: failure tolerance', () => {
  it('does not throw when the script cannot be appended (CSP refusal)', () => {
    enableProd();
    vi.spyOn(document.head, 'appendChild').mockImplementation(() => {
      throw new Error('blocked by Content-Security-Policy');
    });

    expect(() => track('view_change', { view: 'board' })).not.toThrow();
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('disables itself when gtag.js fails to load', () => {
    enableProd();
    track('app_open', { ui_mode: 'desktop', webmidi: true });

    const script = gtagScripts()[0] as HTMLScriptElement;
    script.onerror!(new Event('error'));

    expect(isAnalyticsEnabled()).toBe(false);
  });

  it('caps events per session so a runaway loop cannot grow without bound', () => {
    enableProd();
    for (let i = 0; i < 500; i++) track('view_change', { view: 'board' });

    const events = calls().filter((c) => c[0] === 'event');
    expect(events).toHaveLength(200);
  });
});

describe('analytics: param hygiene', () => {
  it('clamps a string param to the GA4 100-character limit', () => {
    enableProd();
    track('connect_error', { stage: 'handshake', reason: 'x'.repeat(200) });

    const event = calls().find((c) => c[0] === 'event' && c[1] === 'connect_error');
    const params = event![2] as Record<string, string>;
    expect(params.reason).toHaveLength(100);
  });

  it('drops undefined params rather than sending them', () => {
    enableProd();
    track('connect_success', {
      firmware: undefined as unknown as string,
      firmware_ok: false,
      ms_bucket: '1-3s',
    });

    const event = calls().find((c) => c[0] === 'event' && c[1] === 'connect_success');
    expect(event![2]).toEqual({ firmware_ok: false, ms_bucket: '1-3s' });
  });

  it('trackOnce fires a key at most once', () => {
    enableProd();
    trackOnce('panel:looper', 'panel_open', { panel: 'looper', ui_mode: 'desktop' });
    trackOnce('panel:looper', 'panel_open', { panel: 'looper', ui_mode: 'desktop' });
    trackOnce('panel:drums', 'panel_open', { panel: 'drums', ui_mode: 'desktop' });

    const opens = calls().filter((c) => c[0] === 'event' && c[1] === 'panel_open');
    expect(opens).toHaveLength(2);
  });
});

describe('analyticsEvents: bucketing keeps cardinality bounded', () => {
  it('buckets durations', () => {
    expect(msBucket(400)).toBe('<1s');
    expect(msBucket(2_000)).toBe('1-3s');
    expect(msBucket(5_000)).toBe('3-10s');
    expect(msBucket(20_000)).toBe('10-30s');
    expect(msBucket(60_000)).toBe('30s-2m');
    expect(msBucket(300_000)).toBe('2-10m');
    expect(msBucket(3_600_000)).toBe('10m+');
    expect(msBucket(Number.NaN)).toBe('unknown');
    expect(msBucket(-1)).toBe('unknown');
  });

  it('collapses error messages into a closed set of codes', () => {
    expect(errorCode('Handshake timed out')).toBe('timeout');
    expect(errorCode('Web MIDI is not supported')).toBe('no_webmidi');
    expect(errorCode('Permission denied')).toBe('permission');
    expect(errorCode('No GP-200 detected')).toBe('device_not_found');
    expect(errorCode('handshake rejected')).toBe('handshake');
    expect(errorCode('Failed to parse preset')).toBe('bad_file');
    expect(errorCode('something nobody anticipated')).toBe('other');
  });
});
