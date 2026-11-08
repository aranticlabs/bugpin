import { describe, expect, it } from 'vitest';
import {
  toPngFileName,
  validateImageFile,
  type ImageFileRules,
} from '../../../components/branding/imageFile';

const rules: ImageFileRules = {
  types: ['image/png', 'image/jpeg'],
  maxBytes: 10,
  typeError: 'Wrong type',
  sizeError: 'Too big',
};

describe('validateImageFile', () => {
  it('accepts an allowed type within the size limit', () => {
    expect(validateImageFile(new File(['1234567890'], 'a.png', { type: 'image/png' }), rules)).toBe(
      null
    );
  });

  it('rejects a type that is not allowed', () => {
    expect(validateImageFile(new File(['x'], 'a.gif', { type: 'image/gif' }), rules)).toBe(
      'Wrong type'
    );
  });

  it('rejects a file over the size limit', () => {
    expect(
      validateImageFile(new File(['12345678901'], 'a.jpg', { type: 'image/jpeg' }), rules)
    ).toBe('Too big');
  });

  it('reports the type error before the size error', () => {
    expect(
      validateImageFile(new File(['12345678901'], 'a.gif', { type: 'image/gif' }), rules)
    ).toBe('Wrong type');
  });
});

describe('toPngFileName', () => {
  it('replaces the extension with .png', () => {
    expect(toPngFileName('photo.jpeg')).toBe('photo.png');
    expect(toPngFileName('my.icon.webp')).toBe('my.icon.png');
  });

  it('adds .png to names without an extension', () => {
    expect(toPngFileName('icon')).toBe('icon.png');
    expect(toPngFileName('.hidden')).toBe('.hidden.png');
  });
});
