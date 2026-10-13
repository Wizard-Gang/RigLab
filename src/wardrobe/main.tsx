import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { addLibraryStyles } from "../library/addStyles";
import { SAVED_EVENT } from "../library/save";
import { Wardrobe } from "./Wardrobe";
import "../app/styles.css";
import "../app/panels.css";
import "./wardrobe.css";

addLibraryStyles(document);

// The wardrobe is read-only: when the editor saves the library folder, show what it saved.
import.meta.hot?.on(SAVED_EVENT, () => window.location.reload());

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("RigLab wardrobe mount point is missing");

createRoot(mount).render(
  <StrictMode>
    <Wardrobe />
  </StrictMode>,
);
