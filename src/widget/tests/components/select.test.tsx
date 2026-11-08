import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { installDom } from '../helpers/dom';
import { Select } from '../../components/ui/select';

const OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

let restoreDom: () => void;
let container: HTMLElement;

beforeAll(() => {
  restoreDom = installDom();
});

afterAll(() => {
  restoreDom();
});

afterEach(() => {
  render(null, container);
  document.body.replaceChildren();
});

function setup(initial = 'medium') {
  container = document.createElement('div');
  document.body.appendChild(container);
  const changes: string[] = [];
  let value = initial;
  const renderSelect = () =>
    render(
      <Select
        id="priority"
        value={value}
        options={OPTIONS}
        onValueChange={(next) => {
          changes.push(next);
          value = next;
          renderSelect();
        }}
      />,
      container
    );
  act(() => renderSelect());
  const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement;
  return { trigger, changes };
}

const listbox = () => container.querySelector('[role="listbox"]');
const options = () => [...container.querySelectorAll('[role="option"]')] as HTMLElement[];

function press(target: HTMLElement, key: string) {
  act(() => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('Select', () => {
  it('shows the selected label and opens a listbox on click', () => {
    const { trigger } = setup();
    expect(trigger.textContent).toBe('Medium');
    expect(listbox()).toBeNull();

    act(() => trigger.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.textContent)).toEqual(['High', 'Medium', 'Low']);
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('selects an option on click and closes', () => {
    const { trigger, changes } = setup();
    act(() => trigger.click());
    act(() => options()[2].click());

    expect(changes).toEqual(['low']);
    expect(listbox()).toBeNull();
    expect(trigger.textContent).toBe('Low');
  });

  it('supports arrow keys, Enter and Escape', () => {
    const { trigger, changes } = setup();
    press(trigger, 'ArrowDown');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('priority-option-1');

    press(trigger, 'ArrowUp');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('priority-option-0');

    press(trigger, 'Enter');
    expect(changes).toEqual(['high']);
    expect(listbox()).toBeNull();

    press(trigger, 'ArrowDown');
    press(trigger, 'End');
    press(trigger, 'Escape');
    expect(listbox()).toBeNull();
    expect(changes).toEqual(['high']);
  });

  it('jumps to an option by typing its first letter', () => {
    const { trigger, changes } = setup();
    press(trigger, 'l');
    expect(changes).toEqual(['low']);
  });

  describe('open direction', () => {
    const LIST_HEIGHT = 170;
    let originalOffsetHeight: PropertyDescriptor | undefined;

    beforeAll(() => {
      originalOffsetHeight = Object.getOwnPropertyDescriptor(
        window.HTMLElement.prototype,
        'offsetHeight'
      );
      Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get: () => LIST_HEIGHT,
      });
    });

    afterAll(() => {
      if (originalOffsetHeight) {
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      }
    });

    function openInScrollArea(triggerTop: number, triggerBottom: number) {
      const scrollArea = document.createElement('div');
      scrollArea.style.overflowY = 'auto';
      document.body.appendChild(scrollArea);
      container = document.createElement('div');
      scrollArea.appendChild(container);
      scrollArea.getBoundingClientRect = () => ({ top: 100, bottom: 600 }) as DOMRect;
      act(() =>
        render(
          <Select id="priority" value="medium" options={OPTIONS} onValueChange={() => {}} />,
          container
        )
      );
      const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement;
      trigger.getBoundingClientRect = () => ({ top: triggerTop, bottom: triggerBottom }) as DOMRect;
      act(() => trigger.click());
      return listbox() as HTMLElement;
    }

    it('opens downward when the list fits below the trigger', () => {
      const list = openInScrollArea(350, 390);
      expect(list.className).toContain('top-[calc(100%+4px)]');
    });

    it('opens upward when the list does not fit below but fits above', () => {
      const list = openInScrollArea(480, 520);
      expect(list.className).toContain('bottom-[calc(100%+4px)]');
    });
  });

  it('closes when pressing outside the select', () => {
    const { trigger } = setup();
    act(() => trigger.click());
    expect(listbox()).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    });

    expect(listbox()).toBeNull();
  });
});
