import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Démonte le DOM React entre chaque test pour éviter les fuites d'état.
afterEach(() => {
  cleanup();
});
