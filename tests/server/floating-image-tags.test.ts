import { describe, expect, it } from 'bun:test';
import { floatingTagsFor } from '../../src/server/scripts/floating-image-tags';

const released = ['v1.2.5', 'v1.2.6', 'v1.3.0-beta.1', 'v1.3.0-dev', 'v1.3.0'];

describe('floatingTagsFor', () => {
  it('moves every floating tag for the newest release', () => {
    expect(floatingTagsFor('v1.3.0', released)).toEqual({ latest: true, minor: true });
    expect(floatingTagsFor('v1.3.1', released)).toEqual({ latest: true, minor: true });
  });

  it('moves no floating tag when an older release is published again', () => {
    expect(floatingTagsFor('v1.3.0', [...released, 'v1.3.1'])).toEqual({
      latest: false,
      minor: false,
    });
  });

  it('moves only the minor tag for a patch to an older minor line', () => {
    expect(floatingTagsFor('v1.2.7', released)).toEqual({
      latest: false,
      minor: true,
    });
  });

  it('moves the minor tag, but not latest, for a patch to an older major line', () => {
    expect(floatingTagsFor('v1.3.1', [...released, 'v2.0.0'])).toEqual({
      latest: false,
      minor: true,
    });
  });

  it('ignores dev and beta tags of newer versions', () => {
    expect(floatingTagsFor('v1.3.0', [...released, 'v1.4.0-beta.1', 'v2.0.0-dev'])).toEqual({
      latest: true,
      minor: true,
    });
  });

  it('compares numeric components with or without the v prefix', () => {
    expect(floatingTagsFor('v1.3.9', ['1.3.10'])).toEqual({ latest: false, minor: false });
    expect(floatingTagsFor('1.3.0', ['1.3.1'])).toEqual({
      latest: false,
      minor: false,
    });
  });

  it('returns null for a version that is not a plain release', () => {
    expect(floatingTagsFor('v1.3.0-beta.1', released)).toBeNull();
    expect(floatingTagsFor('main', released)).toBeNull();
  });

  it.each([
    ['v1.3.0', ''],
    ['v1.3.0', 'main\nv1.3.1-beta.1\n'],
    ['main', 'v1.3.0\n'],
  ])('fails without writing tag decisions for release %j and inventory %j', (release, input) => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        Bun.resolveSync('../../src/server/scripts/floating-image-tags.ts', import.meta.dir),
        release,
      ],
      { stdin: Buffer.from(input) }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe('');
    expect(result.stderr.toString()).toContain('stable');
  });
});
