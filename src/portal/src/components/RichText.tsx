import { Fragment, type ReactNode } from 'react';

/** Replaces `{name}` placeholders of a translated template with React nodes */
export function RichText({
  template,
  values,
}: {
  template: string;
  values: Record<string, ReactNode>;
}) {
  return (
    <>
      {template
        .split(/\{(\w+)\}/g)
        .map((part, index) =>
          index % 2 === 1 ? <Fragment key={index}>{values[part] ?? `{${part}}`}</Fragment> : part
        )}
    </>
  );
}
