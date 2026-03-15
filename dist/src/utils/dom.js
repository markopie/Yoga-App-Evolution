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

  console.log(`[DOM] safeListen: Registering ${event} for #${id}`);
  el.addEventListener(event, handler);
  registeredListeners.set(key, handler);
}

function setStatus(msg) {
   const el = $("statusText");
   if (el) el.textContent = msg;
}

function showError(where, msg) {
   console.error(msg);
   const el = $(where);
   if (el) el.textContent = msg;
}

function enterBrowseDetailMode() {
   const modal = document.querySelector("#browseBackdrop .modal");
   if (modal) modal.classList.add("detail-mode");
}

function exitBrowseDetailMode() {
    const modal = document.querySelector("#browseBackdrop .modal");
    if (modal) modal.classList.remove("detail-mode");
}

export { normaliseText, $, safeListen, setStatus, showError, enterBrowseDetailMode, exitBrowseDetailMode };
