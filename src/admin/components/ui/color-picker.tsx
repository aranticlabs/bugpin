import { useId, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '../../lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

const HEX_INPUT_PATTERN = /^#[0-9A-Fa-f]{0,6}$/;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * Only complete #RRGGBB values reach onChange. Partial input stays local and is flagged as
 * invalid until it is completed, and leaving the field restores the last valid color.
 */
export function ColorPicker({ value, onChange, disabled, className, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const errorId = useId();
  const text = typed ?? value;
  const invalid = typed !== null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (!HEX_INPUT_PATTERN.test(newValue) && newValue !== '') return;
    if (isHexColor(newValue)) {
      setTyped(null);
      onChange(newValue);
    } else {
      setTyped(newValue);
    }
  };

  const handlePickerChange = (color: string) => {
    setTyped(null);
    onChange(color);
  };

  const errorProps = invalid
    ? { 'aria-invalid': true, 'aria-describedby': errorId }
    : { 'aria-invalid': undefined };

  return (
    <div className={cn('relative w-36', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'absolute left-1.5 top-1/2 z-10 size-6 -translate-y-1/2 rounded-sm border border-black/10 shadow-xs transition-colors dark:border-white/15',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
            style={{ backgroundColor: value }}
            disabled={disabled}
            aria-label={label ? `Pick ${label}` : 'Pick a color'}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto space-y-3 p-3" align="start">
          <HexColorPicker color={value} onChange={handlePickerChange} />
          <Input
            value={text}
            onChange={handleInputChange}
            onBlur={() => setTyped(null)}
            placeholder="#000000"
            className="font-mono text-sm"
            aria-label={label ? `${label} hex value` : 'Hex value'}
            {...errorProps}
          />
        </PopoverContent>
      </Popover>
      <Input
        value={text}
        onChange={handleInputChange}
        onBlur={() => setTyped(null)}
        placeholder="#02658D"
        className="pl-10 font-mono text-sm"
        disabled={disabled}
        aria-label={label}
        {...errorProps}
      />
      {invalid && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          Use the #RRGGBB format.
        </p>
      )}
    </div>
  );
}
