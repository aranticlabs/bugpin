import { FunctionComponent } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown } from 'lucide-preact';
import { cn } from '../../lib/utils';
import { FORM_CONTROL_CLASS, FORM_CONTROL_ERROR_CLASS } from './form-control';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  class?: string;
  error?: boolean;
  disabled?: boolean;
}

const LIST_MAX_HEIGHT_PX = 240;
const LIST_OFFSET_PX = 4;

function scrollParentBounds(element: HTMLElement): { top: number; bottom: number } {
  let parent = element.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent.getBoundingClientRect();
    parent = parent.parentElement;
  }
  return { top: 0, bottom: window.innerHeight };
}

export const Select: FunctionComponent<SelectProps> = ({
  id,
  value,
  options,
  onValueChange,
  class: className,
  error,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: '', timer: 0 });

  const listId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const selected = options[selectedIndex];

  const openList = (index = selectedIndex) => {
    if (disabled) return;
    setOpenUpward(false);
    setHighlighted(index);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option) onValueChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Measured before paint: the list opens downward unless it does not fit there and more
  // room is available above within the scroll area that would otherwise clip it.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!open || !trigger || !list) return;
    const bounds = scrollParentBounds(trigger);
    const rect = trigger.getBoundingClientRect();
    const needed = list.offsetHeight + LIST_OFFSET_PX;
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    setOpenUpward(needed > spaceBelow && spaceAbove > spaceBelow);
  }, [open]);

  // The widget renders inside a shadow root, so the event path is checked instead of the target.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.children[highlighted];
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [open, highlighted]);

  const findByTypeahead = (key: string): number => {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.query += key.toLowerCase();
    state.timer = window.setTimeout(() => (state.query = ''), 500);
    const start = open ? highlighted : selectedIndex;
    const ordered = [...options.slice(start + 1), ...options.slice(0, start + 1)];
    const match = ordered.find((option) => option.label.toLowerCase().startsWith(state.query));
    return match ? options.indexOf(match) : -1;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        const index = findByTypeahead(event.key);
        if (index >= 0) onValueChange(options[index].value);
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlighted((index) => Math.min(last, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlighted((index) => Math.max(0, index - 1));
        break;
      case 'Home':
        event.preventDefault();
        setHighlighted(0);
        break;
      case 'End':
        event.preventDefault();
        setHighlighted(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(highlighted);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const index = findByTypeahead(event.key);
          if (index >= 0) setHighlighted(index);
        }
    }
  };

  return (
    <div ref={rootRef} class="relative w-full">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(highlighted) : undefined}
        aria-invalid={error ? 'true' : undefined}
        disabled={disabled}
        class={cn(
          FORM_CONTROL_CLASS,
          'flex h-10 items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
          open && 'border-ring ring-2 ring-ring/20',
          error && FORM_CONTROL_ERROR_CLASS,
          className
        )}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span class="truncate">{selected?.label}</span>
        <ChevronDown class="w-4 h-4 shrink-0 opacity-50" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          class={cn(
            'absolute left-0 right-0 z-10 overflow-y-auto rounded-md border border-solid border-border bg-background p-1 text-foreground shadow-md',
            openUpward ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'
          )}
          style={{ maxHeight: `${LIST_MAX_HEIGHT_PX}px` }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                class={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm',
                  index === highlighted && 'bg-foreground/8'
                )}
                onPointerMove={() => setHighlighted(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => commit(index)}
              >
                {option.label}
                {isSelected && (
                  <span class="absolute right-2 flex w-4 h-4 items-center justify-center">
                    <Check class="w-4 h-4" aria-hidden="true" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
