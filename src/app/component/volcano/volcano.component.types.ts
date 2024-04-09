import { EnrichmentAnalysisService } from "app/service/enrichment-analysis/enrichment-analysis.service";
import { Observable } from "rxjs";

export enum VolcanoSelectionType {

  /** The selection is showing a standard selection of genes for exploratory analysis, enrichment analysis, etc. */
  Standard = "Standard",

  /** The selection is showing genes that exist in the context of a GO Term */
  GOTerm = "GOTerm"
}

export enum VolcanoSelectionTrigger {

  /** Used in creating the selection object. Can be ignored. */
  Init = "Init",

  /** The selection was triggered by the user clicking on a point */
  Click = "Click",

  /** The selection was triggered by a drag event (rectangle selection) */
  Drag = "Drag",

  /** The selection was triggered by interacting with the "Select By Stats" form */
  SelectByStats = "SelectByStats",

  /** The selection was triggered by interacting with the GO Term tab (searching for a GO term) */
  GOTermTab = "GOTermTab",

  /** The selection was triggered by interacting with the Enrichment Analysis tab (hovering over GO term) */
  EnrichmentAnalysisTab = "EnrichmentAnalysisTab",

  /** The selection was triggered by interacting with the Enrichment Analysis buttons */
  EnrichmentAnalysisButtons = "EnrichmentAnalysisButtons"
}

export type VolcanoSelectionConfig = {
  opacity: number;
  opacityHover: number;
  opacitySelected: number;

  colorSelected: string,
  colorUnselected: string;

  /** If defined, will use the value as the stroke attribute for the circle's `stroke` attribute when selected. */
  strokeSelected: string;
  /** If defined, will use the value as the stroke attribute for the circle's `stroke` attribute when unselected. */
  strokeUnselected: string;

  strokeWidthSelected: number;
  strokeWidthUnselected: number;

  /** If true, significantly regulated genes will be colored by the regulation colors. If false, any selected point will be colored by `this.colorSelected`. Defaults to True */
  useSelectByStatColorLogic: boolean;

  /** Disable mouse selection, which includes clicking on points and drag selection */
  disableMouseSelection: boolean;

  disableTooltip: boolean

  /** Whether to label a point when it is selection. Defaults to false */
  labelOnSelection: boolean;

  /**
   * If set, the interactive coloring logic will be deferred to the selection of this type. This is useful for GO Term selection, where we want to color the points on hover based on the Standard selection logic.
   */
  deferInteractiveColoringLogicTo: VolcanoSelectionType | null;
}

export type VolcanoPoint = {
  x: number;
  y: number;
  gene: string;
  labelled: boolean;
  selected: boolean;
  partOfSelectionOverlap: boolean;
};

export enum VolcanoInteractivityMode {
  SELECT = "select",
  PAN_ZOOM = "panZoom"
}

export interface IVolcanoSelection {
  type: VolcanoSelectionType,
  trigger: VolcanoSelectionTrigger,
  config: VolcanoSelectionConfig,
  selectedPoints: (VolcanoPoint & {selected: true})[]
  labelledPoints: (VolcanoPoint & {labelled: true})[]

  /** Manually mark an overlap with another selection. The subset of overlapping points must already be known (via something like GSEA) */
  markPointsAsOverlappingWithOtherSelection(points: VolcanoPoint[]): void;

  /** Find the points selected in both selections */
  intersection(otherSelection: IVolcanoSelection): VolcanoPoint[];

  /** Reset the data for the selection. All selected and label flags will be lost */
  resetData(points: VolcanoPoint[]): void;

  sortSelection(compareFn: (a: VolcanoPoint, b: VolcanoPoint) => number): void;

  isPointSelected(point: VolcanoPoint): boolean

  /** Deselect a single point. */
  deselectSinglePoint(point: VolcanoPoint): void

  /** Select a single point. Will NOT deselect all first. */
  selectSinglePoint(point: VolcanoPoint): void

  /** Select points. Will deselect all first. Pass an empty array to deselect all. */
  selectPoints(points: VolcanoPoint[], value?: boolean): void

  /** Select points by gene name. Will deselect all first. Pass an empty array to deselect all. */
  selectPointsByGeneName(genes: string[], value?: boolean): void

  isPointLabelled(point: VolcanoPoint): boolean

  /** Unlabel a single point. */
  unlabelSinglePoint(point: VolcanoPoint): void

  /** Label a single point. Will NOT unlabel all first. */
  labelSinglePoint(point: VolcanoPoint): void

  /** Label points. Will unlabel all first. Pass an empty array to unlabel all. */
  labelPoints(points: VolcanoPoint[]): void

  /** Label points by gene name. Will unlabel all first. Pass an empty array to unlabel all. */
  labelPointsByGeneName(genes: string[], value?: boolean): void
}

export interface IVolcanoVisualization {

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

  selectionOfType$(type: VolcanoSelectionType): Observable<IVolcanoSelection>

  /** The values used by the Select By Stats form. Read-only. See `updateSelectByStatsForm` */
  selectByStatsForm: SelectByStatsForm;

  /** Current interactivity mode. */
  mode: VolcanoInteractivityMode;

  setMode(mode: string | VolcanoInteractivityMode): void;

  /** Reset the zoom and pan of the plot */
  resetView(): void;

  /** Add labels to all of the specified points. This will remove all existing labels first. To clear all labels, pass an empty array. */
  labelPoints(points: VolcanoPoint[]): void;

  /** Select up and down regulated genes by -log10(padj) and log2FoldChange thresholds */
  selectByStats(): void;

  /** Clear the selection.
   * @param type The selection type to clear. Defaults to `this.activeSelectionType` if not specified.
  */
  clearSelection(type?: VolcanoSelectionType): void;

  /** When in a GO Term selection, if any of the points are marked as `partOfSelectionOverlap`, create a standard selection from this overlap.  */
  selectFromTermOverlap(): void

  /** Select genes by a GO Term. */
  selectByTerm(
    backgroundDataset: typeof EnrichmentAnalysisService.AVAILABLE_BACKGROUNDS[number]["value"],
    term: string
  ): ReturnType<EnrichmentAnalysisService["getGenesByTerm"]>

  /** Select genes by name, with an optional override for fill color (defaults to regulation color), and whether to show the label for the selected genes (defaults to false) */
  selectGenesByName(genes: string[], options?: { label ?: boolean; fill?: string}): void;

  /** Event listener for clicking download plot. Can be manually invoked with an optinoally file type. Defaults to `this.downloadPlotType` */
  downloadPlot(downloadPlotType?: "svg" | "png"): void;

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




