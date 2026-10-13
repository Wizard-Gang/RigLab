import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { addLibraryStyles } from "../library/addStyles";
import { Wardrobe } from "./Wardrobe";
import "../app/styles.css";
import "../app/panels.css";
import "./wardrobe.css";

addLibraryStyles(document);

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("RigLab wardrobe mount point is missing");

createRoot(mount).render(
  <StrictMode>
    <Wardrobe />
  </StrictMode>,
);
