import { render } from 'preact';
import { AnnotationCanvas } from '../../annotate/AnnotationCanvas';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function checkTouchCleanup() {
  const root = document.body.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  root.append(mount);
  const image = document.createElement('canvas');
  image.width = 1600;
  image.height = 1000;
  let objectCount = -1;
  let lastObjectType: string | undefined;

  render(
    <AnnotationCanvas
      screenshot={image.toDataURL()}
      isMaximized={false}
      onCancel={() => {}}
      onToggleMaximize={() => {}}
      onSave={(_image, annotations) => {
        if ('objects' in annotations && Array.isArray(annotations.objects)) {
          objectCount = annotations.objects.length;
          lastObjectType = annotations.objects[objectCount - 1]?.data?.type;
        }
      }}
    />,
    mount
  );
  const region = mount.querySelector('canvas')?.parentElement?.parentElement;
  if (!region) throw new Error('Missing annotation region');
  region.style.cssText = 'width:352px;height:232px';
  await wait(200);
  const canvas = root.querySelector<HTMLElement>('.upper-canvas');
  const tool = root.querySelector<HTMLButtonElement>('button[aria-label="Rectangle"]');
  const done = Array.from(root.querySelectorAll('button')).find(
    (button) => button.textContent === 'Done'
  );
  if (!canvas || !tool || !done) throw new Error('Missing annotation controls');
  tool.click();
  await wait(100);

  const { left, top } = canvas.getBoundingClientRect();
  const finger = (id: number, x: number) =>
    new Touch({ identifier: id, target: canvas, clientX: left + x, clientY: top + 80 });
  const touch = (type: string, touches: Touch[], changedTouches: Touch[]) =>
    canvas.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        touches,
        targetTouches: touches,
        changedTouches,
      })
    );
  const mouse = (type: string, x: number) =>
    canvas.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        composed: true,
        clientX: left + x,
        clientY: top + x,
        buttons: type === 'mouseup' ? 0 : 1,
      })
    );

  let expected = 0;
  for (const end of ['touchend', 'touchcancel']) {
    const first = finger(1, 160);
    const second = finger(2, 200);
    touch('touchstart', [first], [first]);
    touch('touchstart', [first, second], [second]);
    touch(end, [], [first, second]);
    await wait(500);
    const start = end === 'touchend' ? 30 : 95;
    mouse('mousedown', start);
    mouse('mousemove', start + 30);
    mouse('mouseup', start + 30);
    done.click();
    if (objectCount !== ++expected) throw new Error('Mouse drag failed after ' + end);
  }

  const zoom = root.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
  const pixelate = root.querySelector<HTMLButtonElement>('button[aria-label="Pixelate"]');
  if (!zoom || !pixelate) throw new Error('Missing pixelation controls');
  for (let i = 0; !zoom.disabled && i < 30; i++) {
    zoom.click();
    await wait(20);
  }
  if (!zoom.disabled) throw new Error('Maximum zoom was not reached');
  pixelate.click();
  await wait(100);
  mouse('mousedown', 150);
  mouse('mousemove', 157);
  mouse('mouseup', 157);
  done.click();
  if (lastObjectType !== 'pixelate' || objectCount !== expected + 1) {
    throw new Error('Subpixel scene drag did not export a pixelation patch');
  }
}

checkTouchCleanup().then(
  () => document.documentElement.setAttribute('data-result', 'passed'),
  (error: unknown) => document.documentElement.setAttribute('data-error', String(error))
);
