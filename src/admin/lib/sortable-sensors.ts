import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';

const defaultPointerActivationConstraints = PointerSensor.defaults.activationConstraints;

// A short mouse distance keeps plain clicks on draggable items working as clicks,
// while touch keeps the library's default long-press behavior.
const pointerSensors = [
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
];

export const sortableSensors = [...pointerSensors, KeyboardSensor];

// On the board the drag handle is also the card's open button: Space picks a card up and drops
// it, while Enter keeps opening the card.
export const boardSensors = [
  ...pointerSensors,
  KeyboardSensor.configure({
    keyboardCodes: {
      ...KeyboardSensor.defaults.keyboardCodes,
      start: ['Space'],
      end: ['Space', 'Tab'],
    },
  }),
];
