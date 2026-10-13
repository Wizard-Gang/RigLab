import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { addLibraryStyles } from "../library/addStyles";
import { App } from "./App";
import "./styles.css";
import "./panels.css";

addLibraryStyles(document);

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("RigLab mount point is missing");

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
