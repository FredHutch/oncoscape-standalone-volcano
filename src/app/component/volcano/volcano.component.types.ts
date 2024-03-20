export enum VolcanoSelectionType {

  /** The selection is showing a standard selection of genes for exploratory analysis, enrichment analysis, etc. */
  Standard = "Standard",

  /** The selection is showing genes that exist in the context of a GO Term */
  GOTerm = "GOTerm"
}

export enum VolcanoSelectionTrigger {
  /** The selection was triggered by the user clicking on a point */
  Click = "Click",

  /** The selection was triggered by a drag event (rectangle selection) */
  Drag = "Drag",

  /** The selection was triggered by interacting with the "Select By Stats" form */
  SelectByStats = "SelectByStats",

  /** The selection was triggered by interacting with the GO Term tab (searching for a GO term) */
  GOTermTab = "GOTermTab",

  /** The selection was triggered by interacting with the Enrichment Analysis tab (hovering over GO term) */
  EnrichmentAnalysisTab = "EnrichmentAnalysisTab"
}

export type VolcanoSelection = {
  type: VolcanoSelectionType,
  trigger: VolcanoSelectionTrigger,
  points: VolcanoPoint
}

export type VolcanoPoint = { x: number; y: number; gene: string; };

export enum VolcanoInteractivityMode {
  SELECT = "select",
  PAN_ZOOM = "panZoom"
}

export enum VolcanoTab {
  Table = "Table",
  EnrichmentAnalysis = "EnrichmentAnalysis"
}

export interface IVolcanoVisualization {

  /** List of tabs available in the side bar of the plot */
  tabs: VolcanoTab[];

  /** Whether to only show the plot (no controls or sidebar) */
  plotOnly: boolean;

  /** Whether plot controls are visible. Read-only. See `togglePlotControls` */
  showPlotControls: boolean;

  /** Whether the sidebar is visible. Read-only. See `toggleSidebar` */
  showSidebar: boolean;

  /** Whether the select by stats form is visible. Read-only. See `toggleSelectByStatsForm` */
  showSelectByStatsForm: boolean;

  /** All points in the plot, not just the currently selected ones. Read-only. */
  points: VolcanoPoint[];
  isFullScreen: boolean;

  /** Name of the active tab in the sidebar */
  activeTabName: string;
  selectByStatsFormCollapsed: boolean;

  /** Short-hand for emittedPoints.map(p => p.gene). */
  emittedGenes: string[];
  emittedPoints: VolcanoPoint[];

  /** Selected plot type to download (used for an ngModel) */
  downloadPlotType: "svg" | "png";

  /** The values used by the Select By Stats form. Read-only. See `updateSelectByStatsForm` */
  selectByStatsForm: SelectByStatsForm;

  /** Current interactivity mode. */
  mode: VolcanoInteractivityMode;

  setMode(mode: string | VolcanoInteractivityMode): void;

  isTabEnabled(tab: VolcanoTab): boolean

  /** Reset the zoom and pan of the plot */
  resetView(): void;

  /** Add labels to all of the specified points. This will remove all existing labels first. To clear all labels, pass an empty array. */
  labelPoints(points: VolcanoPoint[]): void;

  /** Select up and down regulated genes by -log10(padj) and log2FoldChange thresholds */
  selectByStats(): void;

  /** Clear the selection. **TODO:** specify which selection type to clear */
  clearSelection(): void;

  /** Select genes by name, with an optional override for fill color (defaults to regulation color), and whether to show the label for the selected genes (defaults to false) */
  selectGenesByName(genes: string[], options?: { label ?: boolean; fill?: string}): void;

  /** Event listener for clicking download plot. Can be manually invoked with an optinoally file type. Defaults to `this.downloadPlotType` */
  onDownloadImageClick(downloadPlotType?: "svg" | "png"): void;

  /** Update the color of up/down-regulated genes */
  updateRegulationColor(color: string, regulation: "up" | "down"): void;

  /** Get the regulation of a point */
  getGeneRegulation(point: VolcanoPoint): "up" | "down" | "none";

  toggleFullScreen(): void;
  toggleSelectByStatsForm(): void;
  togglePlotControls(): void;

  /** Update the select by stats form. the event should have a `target.name` specifying the key (nlogpadj, fc, etc.), and `target.value` with the new value. `selectByStats` will be called for you afterwards. */
  updateSelectByStatsForm(event: Event): void;
}
export type SelectByStatsForm = {
  nlogpadj: number;
  log2FoldChange: number;
  // these are just for the form. We always use the log values for processing
  padj: number;
  fc: number;
  downregulatedColor: string;
  upregulatedColor: string;
};




