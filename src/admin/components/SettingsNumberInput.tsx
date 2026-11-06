import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

interface SettingsNumberInputProps {
  id: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function parseWholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const parsed = Number(text);
  return parsed >= min && parsed <= max ? parsed : null;
}

// Keeps the typed text while it is incomplete or out of range, so clearing the field
// does not snap it back to a default. Only valid values reach onChange.
export function SettingsNumberInput({
  id,
  min,
  max,
  value,
  onChange,
  disabled,
}: SettingsNumberInputProps) {
  const [text, setText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const isInvalid = parseWholeNumber(text, min, max) === null;
  const errorId = `${id}-error`;

  useEffect(() => {
    if (!isFocused) setText(String(value));
  }, [value, isFocused]);

  return (
    <>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? errorId : undefined}
        className={cn(isInvalid && 'border-destructive focus-visible:ring-destructive')}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          if (isInvalid) setText(String(value));
        }}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseWholeNumber(event.target.value, min, max);
          if (parsed !== null) onChange(parsed);
        }}
      />
      {isInvalid && (
        <p id={errorId} className="text-xs text-destructive">
          Enter a whole number from {min} to {max}.
        </p>
      )}
    </>
  );
}
