import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { ScrollArea } from '../ui/scroll-area';
import { VariableNode } from './tiptap-extensions/variable-node';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Code,
  List,
  ListOrdered,
  Undo,
  Redo,
  Variable,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  availableVariables: string[];
  placeholder?: string;
}

type EditorMode = 'wysiwyg' | 'source';

// Helper to check if HTML is a full email template
function isFullHtmlTemplate(html: string): boolean {
  return html.includes('<!DOCTYPE') || html.includes('<html') || html.includes('<head');
}

// Extract the editable content from a full HTML email template
function extractEditableContent(html: string): { content: string; wrapper: string } {
  if (!isFullHtmlTemplate(html)) {
    // Convert text variables to nodes for WYSIWYG display
    return { content: convertTextVariablesToNodes(html), wrapper: '' };
  }

  // Try to extract content from the .content div, excluding the button
  const contentMatch = html.match(
    /<div class="content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/body>/i
  );
  if (contentMatch) {
    let innerContent = contentMatch[1].trim();

    // Extract the button (and any content after it) to keep in wrapper
    // The button is typically: <a href="..." class="button">...</a>
    const buttonMatch = innerContent.match(/(\s*<a[^>]*class="button"[^>]*>[\s\S]*?<\/a>\s*)$/i);
    let buttonHtml = '';
    if (buttonMatch) {
      buttonHtml = buttonMatch[1];
      innerContent = innerContent.replace(buttonMatch[1], '').trim();
    }

    // Convert text variables to nodes for WYSIWYG display
    const content = convertTextVariablesToNodes(innerContent);

    // Store wrapper with placeholder, keeping button after placeholder
    const wrapper = html.replace(contentMatch[1], `{{__EDITOR_CONTENT__}}${buttonHtml}`);
    return { content, wrapper };
  }

  // Fallback: try to extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    // Convert text variables to nodes for WYSIWYG display
    const content = convertTextVariablesToNodes(bodyMatch[1].trim());
    const wrapper = html.replace(bodyMatch[1], '{{__EDITOR_CONTENT__}}');
    return { content, wrapper };
  }

  return { content: convertTextVariablesToNodes(html), wrapper: '' };
}

// Re-wrap edited content back into the template structure
function wrapContentInTemplate(content: string, wrapper: string): string {
  // Convert variable nodes back to plain text for storage
  const cleanContent = convertNodeVariablesToText(content);
  if (!wrapper) {
    return cleanContent;
  }
  return wrapper.replace('{{__EDITOR_CONTENT__}}', cleanContent);
}

// Convert plain text {{variable}} to span elements that Tiptap can parse as VariableNodes
function convertTextVariablesToNodes(html: string): string {
  // Match {{variable.name}} patterns that are in text content, NOT inside HTML attributes
  // We need to avoid converting variables inside href="{{...}}", style="...", etc.

  // Strategy: Only convert variables that are NOT inside an HTML tag's attributes
  // A variable is in an attribute if it's between < and > with an = before it

  return html.replace(
    /(\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\})/g,
    (match, fullMatch, varName, offset, string) => {
      // Check if this match is inside an HTML attribute
      // Look backwards for the nearest < or > to determine context
      const beforeMatch = string.substring(0, offset);
      const lastOpenTag = beforeMatch.lastIndexOf('<');
      const lastCloseTag = beforeMatch.lastIndexOf('>');

      // If we're inside a tag (last < is after last >), don't convert
      if (lastOpenTag > lastCloseTag) {
        // We're inside a tag - check if we're in an attribute value
        const tagContent = beforeMatch.substring(lastOpenTag);
        // If there's an = followed by a quote before our position, we're in an attribute
        if (/=\s*["'][^"']*$/.test(tagContent)) {
          return match; // Don't convert - it's inside an attribute value
        }
      }

      // Check if already wrapped in a span with data-variable
      const before20Chars = string.substring(Math.max(0, offset - 30), offset);
      if (before20Chars.includes('data-variable="')) {
        return match; // Already converted
      }

      return `<span data-variable="${varName}" class="variable-node">${fullMatch}</span>`;
    }
  );
}

// Convert VariableNode spans back to plain text for storage
function convertNodeVariablesToText(html: string): string {
  // Convert <span data-variable="var" class="variable-node">{{var}}</span> back to {{var}}
  return html.replace(/<span[^>]*data-variable="([^"]*)"[^>]*>\{\{[^}]*\}\}<\/span>/g, '{{$1}}');
}

export function TemplateEditor({
  value,
  onChange,
  availableVariables,
  placeholder,
}: TemplateEditorProps) {
  const [mode, setMode] = useState<EditorMode>('source'); // Default to source mode for full HTML templates
  const [sourceValue, setSourceValue] = useState(value);
  const { content: initialContent, wrapper: initialWrapper } = extractEditableContent(value);
  const templateWrapperRef = useRef(initialWrapper);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      VariableNode,
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      const editedContent = editor.getHTML();
      // Re-wrap content in template structure if we have a wrapper
      const fullHtml = wrapContentInTemplate(editedContent, templateWrapperRef.current);
      onChange(fullHtml);
      setSourceValue(fullHtml);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none min-h-75 p-4 focus:outline-none [&_.variable-node]:variable-chip',
      },
    },
  });

  // Sync editor content when value prop changes externally
  useEffect(() => {
    if (editor) {
      const { content: newContent, wrapper: newWrapper } = extractEditableContent(value);
      templateWrapperRef.current = newWrapper;
      // Only update if content actually changed
      if (newContent !== editor.getHTML()) {
        editor.commands.setContent(newContent, { emitUpdate: false });
      }
      setSourceValue(value);
    }
  }, [editor, value]);

  const handleModeToggle = useCallback(() => {
    if (mode === 'wysiwyg') {
      // Switching to source mode - get full HTML (content re-wrapped in template)
      const editedContent = editor?.getHTML() || '';
      const fullHtml = wrapContentInTemplate(editedContent, templateWrapperRef.current);
      setSourceValue(fullHtml);
      setMode('source');
    } else {
      // Switching to WYSIWYG mode - extract content from full HTML
      const { content, wrapper } = extractEditableContent(sourceValue);
      templateWrapperRef.current = wrapper;
      editor?.commands.setContent(content, { emitUpdate: false });
      setMode('wysiwyg');
    }
  }, [mode, editor, sourceValue]);

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setSourceValue(newValue);
      onChange(newValue);
    },
    [onChange]
  );

  const insertVariable = useCallback(
    (variable: string) => {
      if (mode === 'wysiwyg' && editor) {
        editor.chain().focus().insertVariable(variable).run();
      } else {
        // In source mode, insert at cursor position
        const textarea = document.querySelector(
          '[data-source-editor]'
        ) as HTMLTextAreaElement | null;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue =
            sourceValue.substring(0, start) + `{{${variable}}}` + sourceValue.substring(end);
          setSourceValue(newValue);
          onChange(newValue);
          // Reset cursor position after insert
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + variable.length + 4, start + variable.length + 4);
          }, 0);
        }
      }
    },
    [mode, editor, sourceValue, onChange]
  );

  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
          {mode === 'wysiwyg' && (
            <>
              {/* Text formatting */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
                tooltip="Bold"
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
                tooltip="Italic"
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={editor.isActive('underline')}
                tooltip="Underline"
              >
                <UnderlineIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} tooltip="Link">
                <LinkIcon className="h-4 w-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-border mx-1" />

              {/* Alignment */}
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                isActive={editor.isActive({ textAlign: 'left' })}
                tooltip="Align left"
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                isActive={editor.isActive({ textAlign: 'center' })}
                tooltip="Align center"
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                isActive={editor.isActive({ textAlign: 'right' })}
                tooltip="Align right"
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-border mx-1" />

              {/* Lists */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
                tooltip="Bullet list"
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
                tooltip="Numbered list"
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-border mx-1" />

              {/* Undo/Redo */}
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                tooltip="Undo"
              >
                <Undo className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                tooltip="Redo"
              >
                <Redo className="h-4 w-4" />
              </ToolbarButton>

              <div className="w-px h-6 bg-border mx-1" />
            </>
          )}

          {/* Variable insertion */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Variable className="h-4 w-4" />
                Insert Variable
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground px-2 py-1">
                  Click to insert a variable
                </p>
                <ScrollArea className="max-h-48">
                  {availableVariables.map((variable) => (
                    <Button
                      key={variable}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => insertVariable(variable)}
                      className="w-full justify-start font-mono text-sm font-normal"
                    >
                      {`{{${variable}}}`}
                    </Button>
                  ))}
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Mode toggle */}
          <Button variant="outline" size="sm" onClick={handleModeToggle} className="gap-1.5">
            <Code className="h-4 w-4" />
            {mode === 'wysiwyg' ? 'Source' : 'Visual'}
          </Button>
        </div>

        {/* Editor content */}
        {mode === 'wysiwyg' ? (
          <EditorContent
            editor={editor}
            className="bg-background [&_.ProseMirror]:min-h-75 [&_.ProseMirror]:p-4 [&_.ProseMirror:focus]:outline-none [&_.ProseMirror:focus-visible]:ring-2 [&_.ProseMirror:focus-visible]:ring-inset [&_.ProseMirror:focus-visible]:ring-ring"
          />
        ) : (
          <Textarea
            data-source-editor
            value={sourceValue}
            onChange={handleSourceChange}
            placeholder={placeholder}
            className="min-h-75 font-mono text-sm rounded-none border-0 resize-none focus-visible:ring-0"
          />
        )}
      </div>
    </TooltipProvider>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, tooltip, children }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn('h-8 w-8 p-0', isActive ? 'bg-muted' : '')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
