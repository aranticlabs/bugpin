import { FunctionComponent, JSX, Ref } from 'preact';
import { cn } from '../../lib/utils';

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  class?: string;
  cardRef?: Ref<HTMLDivElement>;
}

export const Card: FunctionComponent<CardProps> = ({ class: className, cardRef, ...props }) => {
  return (
    <div
      ref={cardRef}
      class={cn(
        'rounded-xl border border-solid border-border bg-background text-foreground shadow',
        className
      )}
      {...props}
    />
  );
};
