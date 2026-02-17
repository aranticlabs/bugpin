import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function VariableNodeView({ node, selected }: NodeViewProps) {
  const variableName = node.attrs.variableName as string;

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 ${
          selected ? 'ring-2 ring-primary ring-offset-1' : ''
        }`}
        contentEditable={false}
      >
        {`{{${variableName}}}`}
      </span>
    </NodeViewWrapper>
  );
}
