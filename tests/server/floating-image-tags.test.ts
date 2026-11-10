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

  it('accepts versions with or without the v prefix and an empty tag list', () => {
    expect(floatingTagsFor('1.0.0', [])).toEqual({ latest: true, minor: true });
    expect(floatingTagsFor('1.3.0', ['1.3.1'])).toEqual({
      latest: false,
      minor: false,
    });
  });

  it('returns null for a version that is not a plain release', () => {
    expect(floatingTagsFor('v1.3.0-beta.1', released)).toBeNull();
    expect(floatingTagsFor('main', released)).toBeNull();
  });
});
