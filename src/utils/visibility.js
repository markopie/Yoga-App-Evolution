export function isElementDisplayed(element) {
    if (!element) return false;

    const inlineDisplay = element.style?.display;
    if (inlineDisplay) return inlineDisplay !== "none";

    if (typeof getComputedStyle === "function") {
        return getComputedStyle(element).display !== "none";
    }

    return false;
}
