import { LinkifiedText } from '@shared-ui/components/LinkifiedText';

export function PlainText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      <LinkifiedText text={text} linkClassName="underline" />
    </p>
  );
}
