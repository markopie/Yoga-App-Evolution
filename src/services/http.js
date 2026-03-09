async function loadJSON(url, fallback = null) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

export { loadJSON };
