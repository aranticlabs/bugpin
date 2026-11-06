import type { FieldValues, UseFormHandleSubmit } from 'react-hook-form';

/**
 * Runs a react-hook-form submit with the form's validation and resolves to true only when the
 * values were valid and saving finished. A failed save rejects.
 */
export async function submitForm<T extends FieldValues>(
  handleSubmit: UseFormHandleSubmit<T>,
  save: (data: T) => Promise<unknown>
): Promise<boolean> {
  let saved = false;
  await handleSubmit(async (data) => {
    await save(data);
    saved = true;
  })();
  return saved;
}
