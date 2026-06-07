import { create } from "zustand";
import type { ActiveTool } from "../types/domain";

interface TranslationWorkspaceState {
  selectedPageId?: string;
  selectedTextUnitId?: string;
  activeTool: ActiveTool;
  zoom: number;
  leftPanelWidth: number;
  rightPanelWidth: number;
  setSelectedPageId: (pageId: string) => void;
  setSelectedTextUnitId: (textUnitId: string) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setZoom: (zoom: number) => void;
}

export const useTranslationWorkspaceStore = create<TranslationWorkspaceState>((set) => ({
  selectedPageId: undefined,
  selectedTextUnitId: undefined,
  activeTool: "select",
  zoom: 0.76,
  leftPanelWidth: 392,
  rightPanelWidth: 236,
  setSelectedPageId: (pageId) => set({ selectedPageId: pageId }),
  setSelectedTextUnitId: (textUnitId) => set({ selectedTextUnitId: textUnitId }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setZoom: (zoom) => set({ zoom: Math.max(0.45, Math.min(1.2, zoom)) }),
}));
