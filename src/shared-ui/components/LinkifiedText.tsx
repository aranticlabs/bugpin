import { Fragment } from 'react';

export function LinkifiedText({ text, linkClassName }: { text: string; linkClassName: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
        if (index % 2 === 0) return part;
        let href = part.replace(/[.,!?;:]+$/, '');
        let excessClosing = (href.match(/\)/g)?.length ?? 0) - (href.match(/\(/g)?.length ?? 0);
        while (href.endsWith(')') && excessClosing > 0) {
          href = href.slice(0, -1).replace(/[.,!?;:]+$/, '');
          excessClosing--;
        }
        return (
          <Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={linkClassName}
            >
              {href}
            </a>
            {part.slice(href.length)}
          </Fragment>
        );
      })}
    </>
  );
}
