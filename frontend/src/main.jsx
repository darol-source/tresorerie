import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { UIProvider } from "./ui.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <UIProvider>
    <App />
  </UIProvider>
);
