import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';

const defaultPointerActivationConstraints = PointerSensor.defaults.activationConstraints;

// A short mouse distance keeps plain clicks on draggable items working as clicks,
// while touch keeps the library's default long-press behavior.
export const sortableSensors = [
  PointerSensor.configure({
    activationConstraints: (event, source) => {
      if (event.pointerType === 'mouse') {
        return [new PointerActivationConstraints.Distance({ value: 4 })];
      }
      return typeof defaultPointerActivationConstraints === 'function'
        ? defaultPointerActivationConstraints(event, source)
        : defaultPointerActivationConstraints;
    },
  }),
  KeyboardSensor,
];
