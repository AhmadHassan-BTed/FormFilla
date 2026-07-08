export async function fillFileInput(
  el: HTMLInputElement,
  fileBytes: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<boolean> {
  try {
    const file = new File([fileBytes], fileName, { type: mimeType });
    const dt = new DataTransfer();
    dt.items.add(file);

    el.files = dt.files;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(requestAnimationFrame);

    if (!el.files || el.files.length === 0) {
      const dropZone = findClosestDropZone(el);
      if (dropZone) {
        dispatchDragEvents(dropZone, dt, ['dragenter', 'dragover', 'drop']);
        await new Promise(requestAnimationFrame);
      }
    }

    return el.files !== null && el.files.length > 0;
  } catch (err) {
    console.error('Failed to fill file input:', err);
    return false;
  }
}

function findClosestDropZone(el: HTMLInputElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const classes = Array.from(parent.classList).join(' ').toLowerCase();
    const id = (parent.id || '').toLowerCase();
    const text = classes + ' ' + id;
    
    if (
      text.includes('drop') ||
      text.includes('drag') ||
      text.includes('upload') ||
      text.includes('zone') ||
      parent.getAttribute('role') === 'button'
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function dispatchDragEvents(dropZone: HTMLElement, dt: DataTransfer, eventNames: string[]) {
  for (const name of eventNames) {
    const ev = new DragEvent(name, {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt
    });
    dropZone.dispatchEvent(ev);
  }
}
