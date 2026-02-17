import { Node, mergeAttributes } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VariableNodeView } from './VariableNodeView';

export interface VariableNodeOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableNode: {
      insertVariable: (variableName: string) => ReturnType;
    };
  }
}

export const VariableNode = Node.create<VariableNodeOptions>({
  name: 'variableNode',

  group: 'inline',

  inline: true,

  selectable: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      variableName: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-variable'),
        renderHTML: (attributes: { variableName?: string }) => {
          if (!attributes.variableName) {
            return {};
          }
          return {
            'data-variable': attributes.variableName,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable]',
      },
    ];
  },

  renderHTML({
    HTMLAttributes,
  }: {
    HTMLAttributes: Record<string, unknown>;
    node: ProseMirrorNode;
  }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'variable-node',
      }),
      `{{${HTMLAttributes['data-variable']}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableNodeView);
  },

  addCommands() {
    return {
      insertVariable:
        (variableName: string) =>
        ({ chain }) => {
          return chain().insertContent({ type: this.name, attrs: { variableName } }).run();
        },
    };
  },
});
