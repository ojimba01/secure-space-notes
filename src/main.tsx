import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/inter";
import "./index.css";
import { installPracticeGuard } from "./lib/practiceMode";

// Before anything can write: practice mode stops writes at the client.
installPracticeGuard();

createRoot(document.getElementById("root")!).render(<App />);
