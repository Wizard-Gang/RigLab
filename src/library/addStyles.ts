// Adds the library's palettes to a page as one stylesheet, so every art set draws in its own colors.
import { LIBRARY } from "./active";
import { libraryCss } from "./styles";

export function addLibraryStyles(document: Document): void {
  const palettes = document.createElement("style");
  palettes.dataset.riglab = "library";
  palettes.textContent = libraryCss(LIBRARY);
  document.head.append(palettes);
}
