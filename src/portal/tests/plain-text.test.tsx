import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PlainText } from '../src/components/PlainText';

it.each([
  ['See https://example.test/help.', 'https://example.test/help'],
  ['See https://example.test/help, then reply.', 'https://example.test/help'],
  ['See (https://example.test/help).', 'https://example.test/help'],
  ['See https://example.test/page_(details).', 'https://example.test/page_(details)'],
  ['See (https://example.test/page_(details)).', 'https://example.test/page_(details)'],
  ['See (https://example.test/help,).', 'https://example.test/help'],
])('preserves sentence text while linking %s', (text, href) => {
  const { container } = render(<PlainText text={text} />);
  expect(screen.getByRole('link')).toHaveAttribute('href', href);
  expect(screen.getByRole('link')).toHaveTextContent(href);
  expect(container.textContent).toBe(text);
});

it('renders markup as text and excludes quotes from links', () => {
  const text = '<img src=x onerror=alert(1)> "https://example.test/help"';
  const { container } = render(<PlainText text={text} />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toBe(text);
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', 'https://example.test/help');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
});
