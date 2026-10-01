// Acting on pointerdown with preventDefault keeps focus (and the phone keyboard) in the
// capture box (v1 lesson 10). Keyboard activation still works: its click has detail 0.
export function tap(fn) {
  return {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      fn(e);
    },
    onClick: (e) => {
      if (e.detail === 0) fn(e);
    },
  };
}
