function normaliseText(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function $(id) {
  return document.getElementById(id);
}

const registeredListeners = new Map();

function safeListen(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) return;

  const key = `${id}:${event}`;
  if (registeredListeners.has(key)) {
    el.removeEventListener(event, registeredListeners.get(key));
  }

  el.addEventListener(event, handler);
  registeredListeners.set(key, handler);
}

export { normaliseText, $, safeListen };
