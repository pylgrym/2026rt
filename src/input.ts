/** Resolves with the next keydown event, suppressing its default action. */
export function inputKey(): Promise<KeyboardEvent> {
  return new Promise((resolve) => {
    window.addEventListener(
      "keydown",
      (event) => {
        event.preventDefault();
        resolve(event);
      },
      { once: true },
    );
  });
}
