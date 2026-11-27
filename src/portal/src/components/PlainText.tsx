import { LinkifiedText } from '@shared-ui/components/LinkifiedText';
import { cn } from '@shared-ui/lib/utils';

export function PlainText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', className)}>
      <LinkifiedText text={text} linkClassName="underline" />
    </p>
  );
}
