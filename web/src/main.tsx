import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ChatPanel } from "@/components/ChatPanel";
import { BatchList } from "@/pages/BatchList";
import { BatchReview } from "@/pages/BatchReview";
import { DocumentView } from "@/pages/DocumentView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BatchList />} />
        <Route path="/batches/:id" element={<BatchReview />} />
        <Route path="/documents/:id" element={<DocumentView />} />
      </Routes>
      {/* outside the routes, so the conversation survives moving between pages */}
      <ChatPanel />
    </BrowserRouter>
  </StrictMode>,
);
