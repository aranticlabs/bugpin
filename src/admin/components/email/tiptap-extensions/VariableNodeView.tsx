import { NodeViewWrapper } from '@tiptap/react';
import { cn } from '../../../lib/utils';
import type { NodeViewProps } from '@tiptap/react';

export function VariableNodeView({ node, selected }: NodeViewProps) {
  const variableName = node.attrs.variableName as string;

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={cn('variable-chip', selected && 'ring-2 ring-primary ring-offset-1')}
        contentEditable={false}
      >
        {`{{${variableName}}}`}
      </span>
    </NodeViewWrapper>
  );
}
