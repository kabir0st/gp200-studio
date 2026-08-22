// @vitest-environment node
import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain JS Worker module, no type declarations
import { foldPath, redirectTarget } from '../../worker/index.js';

/**
 * The domain move's link equity depends entirely on these redirects being
 * permanent and path-preserving. `wrangler dev --local` does not simulate
 * `assets.run_worker_first`, so it never invokes the Worker and cannot check
 * any of this — which is exactly why it is asserted here instead of left to a
 * manual curl that nobody re-runs.
 */

const APEX = 'https://gp200studio.com';

describe('worker: legacy host redirects', () => {
  it('serves the canonical apex without redirecting', () => {
    expect(redirectTarget(`${APEX}/`)).toBeNull();
    expect(redirectTarget(`${APEX}/guide`)).toBeNull();
    expect(redirectTarget(`${APEX}/guide/loop-station`)).toBeNull();
  });

  it('redirects the original custom domain, preserving the path', () => {
    expect(redirectTarget('https://gp200.afterhour.uk/')).toBe(`${APEX}/`);
    expect(redirectTarget('https://gp200.afterhour.uk/guide/bulk-apply')).toBe(
      `${APEX}/guide/bulk-apply`,
    );
  });

  it('redirects the old subfolder home, stripping the prefix', () => {
    expect(redirectTarget('https://kabirtamari.com/gp200studio/')).toBe(`${APEX}/`);
    expect(redirectTarget('https://kabirtamari.com/gp200studio')).toBe(`${APEX}/`);
    expect(redirectTarget('https://kabirtamari.com/gp200studio/guide/prst-files')).toBe(
      `${APEX}/guide/prst-files`,
    );
  });

  it('folds an old-shaped path that leaked onto the new domain', () => {
    expect(redirectTarget(`${APEX}/gp200studio/guide`)).toBe(`${APEX}/guide`);
    expect(redirectTarget(`${APEX}/gp200studio`)).toBe(`${APEX}/`);
  });

  it('preserves the query string', () => {
    expect(redirectTarget('https://gp200.afterhour.uk/guide?utm_source=x&a=1')).toBe(
      `${APEX}/guide?utm_source=x&a=1`,
    );
  });

  it('does not mistake a path that merely starts with the prefix text', () => {
    // "/gp200studioX" is not the old subfolder, and eating four characters off
    // it would 301 real URLs into nonsense.
    expect(foldPath('/gp200studiox/thing')).toBe('/gp200studiox/thing');
    expect(foldPath('/gp200studio-archive')).toBe('/gp200studio-archive');
    expect(foldPath('/gp200studio/x')).toBe('/x');
  });

  /**
   * The regression the test above was written for but could not actually catch.
   * foldPath() refusing to fold a sibling path is only half the guard: the host
   * check in redirectTarget() used to fire regardless, so kabirtamari.com's own
   * /gp200studio-archive was 301'd to an apex URL that does not exist. Asserting
   * foldPath alone let that ship. kabirtamari.com is somebody else's zone and
   * only the /gp200studio subfolder ever moved.
   */
  it('leaves a sibling path on the shared legacy zone untouched', () => {
    expect(redirectTarget('https://kabirtamari.com/gp200studio-archive')).toBeNull();
    expect(redirectTarget('https://kabirtamari.com/gp200studiox/thing')).toBeNull();
    expect(redirectTarget('https://kabirtamari.com/blog')).toBeNull();
  });

  it('still moves the subfolder itself on that zone', () => {
    expect(redirectTarget('https://kabirtamari.com/gp200studio')).toBe(`${APEX}/`);
    expect(redirectTarget('https://kabirtamari.com/gp200studio/guide')).toBe(`${APEX}/guide`);
  });

  it('never redirects to a URL that would just fold again', () => {
    // A target that still folds would mean a 301 chain, and a target on a
    // non-canonical host would mean a loop. Neither may ever be produced.
    const sources = [
      'https://gp200.afterhour.uk/gp200studio/guide',
      'https://kabirtamari.com/gp200studio/guide/prst-files',
      `${APEX}/gp200studio/guide`,
      'https://www.gp200studio.com/guide',
    ];
    for (const source of sources) {
      const target = redirectTarget(source);
      expect(target).not.toBeNull();
      expect(redirectTarget(target!)).toBeNull();
    }
  });

  it('leaves local development hosts alone so wrangler dev stays usable', () => {
    expect(redirectTarget('http://localhost:8787/guide')).toBeNull();
    expect(redirectTarget('http://127.0.0.1:8787/')).toBeNull();
  });

  it('sends every legacy asset request to the apex too', () => {
    // Assets are what a warm cache re-requests after the move; leaving them on
    // the old host would keep it alive in logs and in the index.
    expect(redirectTarget('https://gp200.afterhour.uk/og-image.png')).toBe(
      `${APEX}/og-image.png`,
    );
    expect(redirectTarget('https://kabirtamari.com/gp200studio/sitemap.xml')).toBe(
      `${APEX}/sitemap.xml`,
    );
  });
});
