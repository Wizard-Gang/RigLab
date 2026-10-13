import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LIBRARY } from "../library/active";
import { libraryCss } from "../library/styles";
import { App } from "./App";
import "./styles.css";
import "./panels.css";

const palettes = document.createElement("style");
palettes.dataset.riglab = "library";
palettes.textContent = libraryCss(LIBRARY);
document.head.append(palettes);

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("RigLab mount point is missing");

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
