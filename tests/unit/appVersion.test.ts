import { describe, it, expect } from 'vitest';
import { parseGitDescribe } from '@/core/appVersion';

describe('parseGitDescribe', () => {
  it('reads the release tag and the commits since it', () => {
    expect(parseGitDescribe('v1.1.0-33-g0a74c51\n')).toEqual({
      label: 'v1.1.0+33',
      commit: '0a74c51',
    });
  });

  it('shows the bare tag for a build exactly on the release', () => {
    expect(parseGitDescribe('v1.1.0-0-g0a74c51')).toEqual({
      label: 'v1.1.0',
      commit: '0a74c51',
    });
  });

  it('keeps a hyphenated tag whole', () => {
    expect(parseGitDescribe('v2.0.0-beta.1-4-gabc1234')?.label).toBe('v2.0.0-beta.1+4');
  });

  it('gives null for anything that is not --long output', () => {
    expect(parseGitDescribe('')).toBeNull();
    expect(parseGitDescribe('v1.1.0')).toBeNull();
    expect(parseGitDescribe('fatal: No names found, cannot describe anything.')).toBeNull();
  });
});
