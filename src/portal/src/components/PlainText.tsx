export function PlainText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  );
}
