import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { cn } from '../../lib/utils';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ColorPicker({ value, onChange, disabled, className }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  const handleColorChange = (color: string) => {
    onChange(color);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Allow # and hex characters
    if (/^#[0-9A-Fa-f]{0,6}$/.test(newValue) || newValue === '') {
      onChange(newValue);
    }
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'w-20 h-10 rounded-md border border-input shadow-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            style={{ backgroundColor: value }}
            disabled={disabled}
            aria-label="Pick a color"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <HexColorPicker color={value} onChange={handleColorChange} />
          <div className="mt-3">
            <Input
              value={value}
              onChange={handleInputChange}
              placeholder="#000000"
              className="font-mono text-sm"
            />
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={value}
        onChange={handleInputChange}
        placeholder="#02658D"
        className="flex-1"
        disabled={disabled}
      />
    </div>
  );
}
