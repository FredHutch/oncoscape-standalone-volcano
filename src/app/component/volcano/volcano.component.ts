import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  ViewChild,
} from "@angular/core";
// import { OncoData } from "app/oncoData";
import * as d3 from "d3";

import { VolcanoGeneTableComponent } from "./volcano-gene-table/volcano-gene-table.component";
import { MatTabChangeEvent } from "@angular/material";
import { IVolcanoVisualization, VolcanoPoint, VolcanoTab, VolcanoSelection, VolcanoSelectionType, VolcanoSelectionTrigger } from "./volcano.component.types";
import { VolcanoInteractivityMode } from "./volcano.component.types";
import { SelectByStatsForm } from "./volcano.component.types";
import { createEmptyVolcanoSelection } from "./volcanoSelectionTypesConfig";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";

@Component({
  selector: "app-visualization-volcano",
  templateUrl: "./volcano.component.html",
  styleUrls: ["./volcano.component.scss"],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class VolcanoComponent implements AfterViewInit, OnInit, IVolcanoVisualization {
  static readonly OPACITY = 0.2;
  static readonly OPACITY_HOVER = 0.5;
  static readonly OPACITY_SELECTED = 1;
  static readonly AXIS_LABEL_PADDING = 20;
  static readonly TITLE_PADDING = 0;
  static readonly MARGIN = { top: 20, right: 20, bottom: 30, left: 30 };
  static readonly DATA_PADDING = { top: 5, right: 0.5, bottom: 0, left: 0.5 };
  static WIDTH = document.documentElement.clientWidth / 2.2;

  // Make height 75% of width
  static HEIGHT = (document.documentElement.clientWidth / 2.2) * 0.75;
  static readonly COLOR_UNSELECTED = "#454444";
  static readonly COLOR_SELECTED = "black";
  static readonly POINT_RADIUS = 3;
  static readonly LABEL_OFFSET = {
    x: 4,
    y: -4,
    // x: 20,
    // y: -15,
  };

  @Input() data: Object;
  private _plotOnly: boolean = false;
  /** If true, controls and side bar will not be rendered. */
  @Input() set plotOnly(value: boolean) {
    this._plotOnly = value;
  }
  @Input() genesToSelectByDefault: string[] = [];
  @Input() id: string;
  @Input() tabs = [VolcanoTab.Table, VolcanoTab.EnrichmentAnalysis]

  @ViewChild(VolcanoGeneTableComponent, { static: false })
  geneTable: VolcanoGeneTableComponent;

  get plotOnly(): boolean {
    return this._plotOnly;
  }

  get mode(): VolcanoInteractivityMode {
    return this._mode;
  }

  get points(): VolcanoPoint[] {
    return this._points
  }

  // Used in adjusting axis ranges. Uncomment if we add this back in
  // public dataBoundingBox: {
  //   xMin: number;
  //   xMax: number;
  //   yMin: number;
  //   yMax: number;
  // } = {
  //   xMin: 0,
  //   xMax: 0,
  //   yMin: 0,
  //   yMax: 0,
  // };
  // public axisRanges: {
  //   xMin: number;
  //   xMax: number;
  //   yMin: number;
  //   yMax: number;
  // } = {
  //   xMin: 0,
  //   xMax: 0,
  //   yMin: 0,
  //   yMax: 0,
  // };

  public downloadPlotType: "svg" | "png" = "svg";

  get selectByStatsForm(): SelectByStatsForm {
    return this._selectByStatsForm;
  }

  get showSidebar(): boolean {
    return this._showSidebar
  }

  get showSelectByStatsForm(): boolean {
    return this._showSelectByStatsForm
  }

  get showPlotControls(): boolean {
    return this._showPlotControls
  }

  get activeSelectionType(): VolcanoSelectionType {
    return this._activeSelectionType;
  }
  set activeSelectionType(type: VolcanoSelectionType) {
    this._activeSelectionType = type;
    // relabel points, only with the ones that have visible labels for the new active selection
    this.labelPoints(this.getActiveSelection().points.filter(p => p.visibleLabel))
  }



  public selectByStatsFormCollapsed: boolean = false;

  public isFullScreen = false;
  public activeTabName: string = "Table";

  private selections$: BehaviorSubject<VolcanoSelection[]> = new BehaviorSubject([
    createEmptyVolcanoSelection(VolcanoSelectionType.Standard),
    createEmptyVolcanoSelection(VolcanoSelectionType.GOTerm)
  ]);

  private selections: VolcanoSelection[] = [
    createEmptyVolcanoSelection(VolcanoSelectionType.Standard),
    createEmptyVolcanoSelection(VolcanoSelectionType.GOTerm)
  ]
  private _activeSelectionType: VolcanoSelectionType = VolcanoSelectionType.Standard;

  // Change the default mode here
  private _mode: VolcanoInteractivityMode = VolcanoInteractivityMode.SELECT;

  private svgId: string = "";
  private plot: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
  private zoom: d3.ZoomBehavior<Element, unknown>;
  private isDragging = false;
  private artificallyHoldingShift = false;
  private xAxis: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
  private yAxis: d3.Selection<SVGGElement, unknown, HTMLElement, any>;

  // this is the most recent selected point, if any.
  private mostRecentSelectedPoint: VolcanoPoint = null;

  private _points: VolcanoPoint[] = [];

  // Keep track of how points change during a drag, so we can reverse when the rectangle moves off of them
  // These will reset on mouseup
  private pointsNewToThisDrag = [];
  private pointsDeletedThisDrag = [];

  private _showPlotControls: boolean = true;
  private _showSelectByStatsForm: boolean = true;
  private _showSidebar: boolean = true;

  private _selectByStatsForm: SelectByStatsForm = {
    nlogpadj: 1.301,
    log2FoldChange: 0.58,
    padj: 0.05,
    fc: 1.5,
    downregulatedColor: "#CF492F",
    upregulatedColor: "#2FCF3F",
  };

  // The names of the genes that has a visible tooltip
  private activeGeneTooltips: string[] = [];

  private eventCoords: {
    draw: { x: number; y: number };
    domain: { x: number; y: number };
  };
  private xScale: d3.ScaleLinear<number, number>;
  private yScale: d3.ScaleLinear<number, number>;
  private zoomXScale: d3.ScaleLinear<number, number>;
  private zoomYScale: d3.ScaleLinear<number, number>;
  private domain: { x: [number, number]; y: [number, number] };
  private hovered: VolcanoPoint;



  // #region Public functions

  handleEAGOTermHover(genesInGOTerm: string[]): void {
    console.log("Genes!", genesInGOTerm)
  }

  selectionOfType$(type: string): Observable<VolcanoSelection> {
    return this.selections$.pipe(
      map(list => list.find(item => item.type === type)), // Get the object with the requested type
      filter(object => object !== undefined) // Filter out undefined objects (if no object with the requested type)
    );
  }

  selectedTabChange(event: MatTabChangeEvent) {
    this.activeTabName = event.tab.textLabel;
  }

  togglePlotControls(): void {
    this._showPlotControls = !this._showPlotControls
  }

  toggleSelectByStatsForm(): void {
    this._showSelectByStatsForm = !this._showSelectByStatsForm
  }

  toggleFullScreen() {
    this.isFullScreen = !this.isFullScreen;
  }

  toggleSidebar() {
    this._showSidebar = !this._showSidebar;
  }

  isTabEnabled(tab: VolcanoTab): boolean {
    return this.tabs.findIndex(t => t === tab) !== -1
  }

  updateSelectByStatsForm(event: Event) {
    const precision = 3;
    // @ts-ignore
    const field = event.target.name;
    // @ts-ignore
    const value = event.target.value;

    this._selectByStatsForm[field] = value;
    // update the associated log/ non-log field
    switch (field) {
      case "nlogpadj":
        this._selectByStatsForm.padj = Number(
          Math.pow(10, -value).toPrecision(precision)
        );
        break;
      case "log2FoldChange":
        this._selectByStatsForm.fc = Number(
          Math.pow(2, value).toPrecision(precision)
        );
        break;
      case "padj":
        this._selectByStatsForm.nlogpadj = Number(
          -Math.log10(value).toPrecision(precision)
        );
        break;
      case "fc":
        this._selectByStatsForm.log2FoldChange = Number(
          Math.log2(value).toPrecision(precision)
        );
        break;
      default:
        console.error(`Unknown stats form field: ${field}`);
    }

    this.selectByStats();
  }



  getGeneRegulation(point: VolcanoPoint): "up" | "down" | "none" {
    if (
      point.x > this._selectByStatsForm.log2FoldChange &&
      point.y > this._selectByStatsForm.nlogpadj
    ) {
      return "up";
    }

    if (
      point.x < -this._selectByStatsForm.log2FoldChange &&
      point.y > this._selectByStatsForm.nlogpadj
    ) {
      return "down";
    }

    return "none";
  }

  updateRegulationColor(color: string, regulation: "up" | "down") {

    // regulation color only applies in standard selection type
    this.activeSelectionType = VolcanoSelectionType.Standard

    if (regulation === "up") {
      this._selectByStatsForm.upregulatedColor = color;
      // select all points that are upregulated and currently selected
      d3.selectAll(".point.upregulated.selected").attr("fill", color);
    } else {
      this._selectByStatsForm.downregulatedColor = color;
      d3.selectAll(".point.downregulated.selected").attr("fill", color);
    }
  }

  onDownloadImageClick(downloadPlotType = this.downloadPlotType) {
    switch (downloadPlotType) {
      case "svg":
        this.downloadAsSVG();
        break;
      case "png":
        this.downloadAsPNG();
        break;
      default:
        console.error("Invalid download type");
        break;
    }
  }

  selectGenesByName(
    genes: string[],
    options: {
      label?: boolean;
      fill?: string;
    } = { label: false }
  ): void {
    const pointsToClick = this._points.filter((p) => genes.includes(p.gene));
    const event = new MouseEvent("selectGenesByName");
    this.stylePointsOnClick(event, pointsToClick, {
      tooltip: false,
      fill: options.fill,
    });
    this.getActiveSelection().points.push(...pointsToClick);

    if (options.label) {
      this.labelPoints(this.getActiveSelection().points);
    }
  }

  clearSelection(type = this.activeSelectionType) {
    // clear out the selected cohort subsets
    this.getActiveSelection().points.length = 0;

    // reset the points to unselected style
    d3.selectAll(".point")
      .attr("fill", VolcanoComponent.COLOR_UNSELECTED)
      .attr("opacity", function (d, i, nodes) {
        const outOfView = d3.select(this).classed("out-of-view");
        return outOfView ? 0 : VolcanoComponent.OPACITY;
      })
      .classed("selected", false);

    // remove all tooltips
    d3.selectAll(".volcano-tooltip").remove();
    this.activeGeneTooltips.length = 0;

    // remove all labels
    this.labelPoints([]);

    // emit the new cleared selection so other elements on the page can respond
    this.emitSelectionUpdate();
  }


  selectByStats() {
    // select by stats should be used within a standard selection context
    this.activeSelectionType = VolcanoSelectionType.Standard;

    // find all points that are above the -log10(padj) line and greater than the absolute value of log2FoldChange
    const upregulatedPoints = this._points.filter(
      (point) => this.getGeneRegulation(point) === "up"
    );

    const downregulatedPoints = this._points.filter(
      (point) => this.getGeneRegulation(point) === "down"
    );
    this.clearSelection();

    this.selectGenesByName(
      [...downregulatedPoints, ...upregulatedPoints].map((p) => p.gene)
    );

    // draw dashed lines to show the thresholds
    this.drawThresholdLines();

    this.emitSelectionUpdate();
  }

  labelPoints(points: VolcanoPoint[]) {
    // clear out any existing labels
    d3.selectAll(`.volcano-label`).remove();
    this.getActiveSelection().points.forEach(p => {p.visibleLabel = false})

    points.forEach((point) => {

      // find the point in the list of ALL points
      const point_ = this._points.find((p) => p.gene === point.gene);

      if (point_) {

        // mark the point label is visible for the active selection
        this.getActiveSelection().points.find(p => p.gene === point_.gene).visibleLabel = true;

        const x =
          this.zoomXScale(point_.x) +
          VolcanoComponent.MARGIN.left +
          VolcanoComponent.AXIS_LABEL_PADDING;
        const y =
          this.zoomYScale(point_.y) +
          VolcanoComponent.MARGIN.top +
          VolcanoComponent.TITLE_PADDING;

        // // add a rectangle behind the text
        // d3.select(`#${this.svgId}`).append("rect")
        //   .attr("class", "volcano-label")
        //   .attr("x", x + VolcanoComponent.LABEL_OFFSET.x - 2)
        //   .attr("y", y + VolcanoComponent.LABEL_OFFSET.y - 12)
        //   .attr("width", 10)
        //   .attr("height", 10)
        //   .attr("fill", "white");

        this.plot
          .append("text")
          .attr("name", point.gene)
          .attr("class", "volcano-label")
          .attr("x", x + VolcanoComponent.LABEL_OFFSET.x)
          .attr("y", y + VolcanoComponent.LABEL_OFFSET.y)
          .attr("font-size", "10px")
          .attr("font-weight", "bold")
          .text(point_.gene);

        // draw a line from the center left of the text to the point
        // d3.select(`#${this.svgId}`).append("line")
        //   .attr("class", "volcano-label-line")
        //   .attr("x1", x + VolcanoComponent.LABEL_OFFSET.x - 2)
        //   .attr("y1", y + VolcanoComponent.LABEL_OFFSET.y - 2)
        //   .attr("x2", x)
        //   .attr("y2", y)
        //   .attr("stroke", "black")
        //   .attr("stroke-width", 1);
      }
    });
  }

  resetView() {
    const svg = d3.select(`#${this.svgId}`);

    // @ts-ignore
    const defaultMode = this._mode;
    this.setMode(VolcanoInteractivityMode.PAN_ZOOM);
    // @ts-ignore
    svg.call(this.zoom.transform, d3.zoomIdentity);
    this.setMode(defaultMode);
  }

  setMode(mode: string | VolcanoInteractivityMode) {
    const svg = d3.select(`#${this.svgId}`);
    this._mode = mode as VolcanoInteractivityMode;

    const modeToggles = {
      [VolcanoInteractivityMode.PAN_ZOOM]: {
        enable: () => {
          svg.call(this.zoom);
        },
        disable: () => {
          svg.on(".zoom", null);
        },
      },
      [VolcanoInteractivityMode.SELECT]: {
        enable: () => {
          d3.select(`#${this.svgId}`)
            .on("mousedown", this.onMouseDown.bind(this))
            .on("mousemove", this.onMouseMove.bind(this))
            .on("mouseup", this.onMouseUp.bind(this));
        },
        disable: () => {
          d3.select(`#${this.svgId}`)
            .on("mousedown", null)
            .on("mousemove", null)
            .on("mouseup", null);
        },
      },
    };

    Object.keys(modeToggles).forEach((mode) => {
      if (mode === this._mode) {
        modeToggles[mode].enable();
      } else {
        modeToggles[mode].disable();
      }
    });
  }

  // #endregion

  // #region Event Listeners

  private onMouseDown(event) {
    // return on right click
    if (event.button == 2) {
      return;
    }

    const shiftKeyPressed = event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = event.altKey;

    if (shiftKeyPressed && altKeyPressed) {
      // if both shift and alt are pressed, do nothing
      return;
    }

    // If the mouse is over a point, do nothing. Let the point's click event handle it.
    if (this.hovered) {
      return;
    }

    const activeSelectionConfig = this.getActiveSelection().config

    if (activeSelectionConfig.disableMouseSelection) {
      return;
    }

    const anyModifierKeyPressed = shiftKeyPressed || altKeyPressed;
    if (!anyModifierKeyPressed) {
      // if no modifier keys are pressed, clear the selection
      this.clearSelection();
    }

    this.isDragging = true;
    this.eventCoords = this.getEventCoords(event);

    // remove any existing rectangle
    d3.select(`#${this.svgId}`).selectAll(".drag-rectangle").remove();

    this.drawTooltipText(event);
  }

  private onMouseMove(event) {
    const shiftKeyPressed = event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = event.altKey;

    // if both shift and alt are pressed, do nothing
    if (shiftKeyPressed && altKeyPressed) {
      return;
    }

    const activeSelectionConfig = this.getActiveSelection().config

    if (activeSelectionConfig.disableMouseSelection) {
      return;
    }

    if (this.isDragging) {
      // remove any existing rectangle
      d3.select(`#${this.svgId}`).selectAll(".drag-rectangle").remove();
      d3.select(`#${this.svgId}`)
        .selectAll(".drag-rectangle-coordinates")
        .remove();

      let color = altKeyPressed ? "#d16666" : "lightblue";

      // get start and current coordinates
      const startDomain = this.eventCoords.domain;
      const currentDomain = this.getEventCoords(event).domain;
      const startDraw = this.eventCoords.draw;
      const currentDraw = this.getEventCoords(event).draw;

      // draw the rectangle
      d3.select(`#${this.svgId}`)
        .append("rect")
        .data([
          {
            start: startDraw,
            current: currentDraw,
          },
        ])
        .attr("class", "drag-rectangle")
        .attr("x", (d) => Math.min(d.start.x, d.current.x))
        .attr("y", (d) => Math.min(d.start.y, d.current.y))
        .attr("width", (d) => Math.abs(d.current.x - d.start.x))
        .attr("height", (d) => Math.abs(d.current.y - d.start.y))
        .attr("fill", color)
        .attr("opacity", 0.2);

      this.drawTooltipText(event);

      // if current is beyond the domain, set it to the domain boundary
      if (currentDomain.x > this.domain.x[1]) {
        currentDomain.x = this.domain.x[1];
      }
      if (currentDomain.x < this.domain.x[0]) {
        currentDomain.x = this.domain.x[0];
      }
      if (currentDomain.y > this.domain.y[1]) {
        currentDomain.y = this.domain.y[1];
      }
      if (currentDomain.y < this.domain.y[0]) {
        currentDomain.y = this.domain.y[0];
      }

      // calculate the rectangle coordinates
      const rectCoords = [
        {
          x: Math.min(startDomain.x, currentDomain.x),
          y: Math.min(startDomain.y, currentDomain.y),
        },
        {
          x: Math.max(startDomain.x, currentDomain.x),
          y: Math.max(startDomain.y, currentDomain.y),
        },
      ];

      const toClick: VolcanoPoint[] = [];

      const deselectPoint = (p: VolcanoPoint) => {
        this.getActiveSelection().points.splice(this.getActiveSelection().points.indexOf(p), 1);
        toClick.push(p);
      };

      const selectPoint = (p: VolcanoPoint) => {
        this.getActiveSelection().points.push(p);
        toClick.push(p);
      };

      this._points.forEach((point) => {
        const inRect =
          this.pointInRect(point, rectCoords) &&
          !d3.select(`circle[name=${point.gene}]`).classed("out-of-view");
        const wasAlreadySelected = this.getActiveSelection().points.includes(point);
        const newToThisDrag = this.pointsNewToThisDrag.includes(point);
        const deletedThisDrag = this.pointsDeletedThisDrag.includes(point);

        if (!inRect && wasAlreadySelected) {
          if (!shiftKeyPressed && !altKeyPressed) {
            // selected point not in rectangle and no modifier keys pressed
            // Expected behavior is to deselect the point
            deselectPoint(point);
            return;
          }

          if (shiftKeyPressed && !newToThisDrag) {
            // selected point not in rectangle and shift is pressed, and not new to this drag
            // Expected behavior is to keep the point (do nothing)
            return;
          }

          if (shiftKeyPressed && newToThisDrag) {
            // selected point not in rectangle and shift is pressed, and new to this drag
            // Expected behavior is to deselect the point
            deselectPoint(point);
            return;
          }
        }

        if (!inRect && deletedThisDrag && altKeyPressed) {
          // selected point not in rectangle and alt is pressed, and deleted this drag
          // Expected behavior is to select the point
          selectPoint(point);
          this.pointsDeletedThisDrag.splice(
            this.pointsDeletedThisDrag.indexOf(point),
            1
          );
          return;
        }

        if (inRect) {
          if (wasAlreadySelected) {
            if (altKeyPressed) {
              // point previously selected, alt is pressed, point is in rectangle
              // Expected behavior is to deselect the point
              deselectPoint(point);
              this.pointsDeletedThisDrag.push(point);
              return;
            }
          }

          if (!wasAlreadySelected) {
            if (!altKeyPressed) {
              // point not previously selected, alt is not pressed, and point is in rectangle
              // Expected behavior is to select the point
              selectPoint(point);
              this.pointsNewToThisDrag.push(point);
              return;
            }
          }
        }
      });

      // bulk style the points
      this.stylePointsOnClick(event, toClick, { tooltip: false });
    }
  }

  private onMouseUp() {
    // end the drag
    if (this.isDragging) {
      this.isDragging = false;
      this.pointsNewToThisDrag.length = 0;
      this.pointsDeletedThisDrag.length = 0;
      d3.select(".drag-rectangle-text").remove();
      d3.select(".drag-rectangle").remove();
      d3.select(".drag-rectangle-coordinates").remove();
    }

    this.emitSelectionUpdate();
  }

  private onTooltipMouseOver(event: MouseEvent, point: VolcanoPoint) {
    this.activeGeneTooltips.push(point.gene);
  }

  private onTooltipMouseOut(event: MouseEvent, point: VolcanoPoint) {
    this.onPointMouseOut(event, point);
  }

  private onPointMouseOver(event: MouseEvent, point: VolcanoPoint) {
    // don't call the same hover event twice
    if (this.hovered == point) {
      return;
    }

    this.hovered = point;
    this.stylePointOnHover(event, point);
  }

  private onPointClick(event: MouseEvent, point: VolcanoPoint) {
    const shiftPressed = event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = event.altKey;

    const alreadySelected = this.getActiveSelection().points.includes(point);
    const somethingIsSelected = this.getActiveSelection().points.length > 0;
    if (somethingIsSelected) {
      if (altKeyPressed) {
        if (this.getActiveSelection().points.includes(point)) {
          // the point is already selected with alt pressed
          // Expected behavior is to remove this point from the selection
          this.getActiveSelection().points.splice(this.getActiveSelection().points.indexOf(point), 1);
          this.stylePointOnClick(event, point);
          this.onPointMouseOut(event, point);
          this.emitSelectionUpdate();
          return;
        } else {
          // something is already selected and alt is pressed. The point is not already selected
          // Expected behavior is to do nothing
          return;
        }
      }

      if (shiftPressed) {
        // shift is pressed and something else is already selected
        if (alreadySelected) {
          // the point is already selected with shift or alt pressed
          // Expected behavior is to remove this point from the selection
          this.getActiveSelection().points.splice(this.getActiveSelection().points.indexOf(point), 1);
          this.stylePointOnClick(event, point);
          this.onPointMouseOut(event, point);
          this.emitSelectionUpdate();
          return;
        } else {
          // the point is not already selected with shift pressed
          // Expected behavior is to add this point to the selection

          // clear all tooltips
          d3.selectAll(".volcano-tooltip").remove();
          this.activeGeneTooltips.length = 0;

          this.getActiveSelection().points.push(point);
          this.stylePointOnClick(event, point);
          this.mostRecentSelectedPoint = point;
          this.emitSelectionUpdate();
          return;
        }
      } else {
        // shift is not pressed and something else is already selected.
        // Expected behavior is to clear the selection and select this point
        this.clearSelection();
        // put this point back in focus
        this.stylePointOnClick(event, point, true);
        this.getActiveSelection().points.push(point);
        this.mostRecentSelectedPoint = point;

        // because the order of operations for putting the point back in focus, we need to manually call drawTooltip
        this.drawTooltip(event, point);
        this.emitSelectionUpdate();
        return;
      }
    }

    this.mostRecentSelectedPoint = point;
    this.getActiveSelection().points.push(point);
    this.stylePointOnClick(event, point);
    this.emitSelectionUpdate();
  }

  // #endregion

  // #region Helper functions

  private getActiveSelection(): VolcanoSelection {
    return this.selections.find(s => s.type === this.activeSelectionType)
  }

  private getSelectedColor(point: VolcanoPoint): string {
    switch (this.getGeneRegulation(point)) {
      case "up":
        return this._selectByStatsForm.upregulatedColor;
      case "down":
        return this._selectByStatsForm.downregulatedColor;
      default:
        return VolcanoComponent.COLOR_SELECTED;
    }
  }

  private downloadAsPNG() {
    // get SVG element
    var svg = document.getElementById(this.svgId);

    // get SVG source
    var serializer = new XMLSerializer();
    var source = serializer.serializeToString(svg);

    // add namespaces
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
    if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
    }

    // add XML declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    // create a Blob from the SVG source
    var blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });

    // create an image element
    var img = new Image();

    // create a data URL from the Blob
    var url = URL.createObjectURL(blob);

    // set the image source to the SVG data URL
    img.src = url;

    // create a canvas
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");

    // set canvas dimensions to match the SVG
    // @ts-ignore
    canvas.width = svg.width.baseVal.value;
    // @ts-ignore
    canvas.height = svg.height.baseVal.value;

    // set background to white
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // wait for the image to load before drawing on the canvas
    img.onload = function () {
      // draw the image onto the canvas
      context.drawImage(img, 0, 0);

      // convert canvas content to data URL in PNG format
      var pngUrl = canvas.toDataURL("image/png");

      // set the PNG data URL as the href attribute of the download link
      var saveLink = document.getElementById(
        "download-link"
      ) as HTMLAnchorElement;
      if (saveLink) {
        saveLink.href = pngUrl;
        saveLink.download = `volcano-plot-${new Date().toISOString()}.png`;
      }
    };
  }

  private downloadAsSVG() {
    //get svg element.
    var svg = document.getElementById(this.svgId);

    //get svg source.
    var serializer = new XMLSerializer();
    var source = serializer.serializeToString(svg);

    // get svg source.
    var serializer = new XMLSerializer();
    var source = serializer.serializeToString(svg);

    // add name spaces.
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
    if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
      source = source.replace(
        /^<svg/,
        '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
    }

    // add xml declaration
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    // convert svg source to URI data scheme.
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);

    // set url value to the download link's href attribute.
    var dLink = document.getElementById("download-link") as HTMLAnchorElement;
    if (dLink) {
      dLink.href = url;
      dLink.download = `volcano-plot-${new Date().toISOString()}.svg`;
    }
  }

  /**
   * Regardless of how the data looks coming in, we want to transform it to the following format:
   * [
   * {x: number, y: number, gene: string},
   * ]
   */
  private processData(
    data: Object,
    genesToSelectByDefault = []
  ): {
    data: VolcanoPoint[];
    genesToSelectByDefault: string[];
    genes: string[];
  } {
    const genes = Object.keys(data["log2FoldChange"]);
    // const firstGene = Object.keys(data)[0];
    // const genes = Object.keys(data[firstGene]);

    const x = Object.keys(data["log2FoldChange"]).map(
      (e) => data["log2FoldChange"][e]
    ); // because our build doesn't support Object.values
    const yValues = Object.keys(data["padj"]).map((e) => data["padj"][e]);
    const y = yValues.map((p) => {
      const res = -Math.log10(p);
      if (Math.abs(res) == Infinity || isNaN(res)) {
        return null;
      }
      return res;
    });

    let finalData: VolcanoPoint[] = x.map((xValue, i) => {
      return {
        x: xValue,
        y: y[i],
        gene: genes[i],
        visibleLabel: false
      };
    });

    // filter out null values
    finalData = finalData.filter((d) => d.x != null && d.y != null);

    return {
      data: finalData,
      genesToSelectByDefault,
      genes,
    };
  }

  private onPointMouseOut(event, point) {
    // immediately remove the tooltip from the list of active tooltips when the mouse leaves. If the tooltip's mouseover event is called, it will be added back to the list before the timeout
    this.activeGeneTooltips.splice(
      this.activeGeneTooltips.indexOf(point.gene),
      1
    );

    setTimeout(() => {
      // After the timeout, if the tooltip is still active, then that means the user has hovered over the tooltip
      if (this.activeGeneTooltips.includes(point.gene)) {
        return;
      }

      this.hovered = null;

      if (this.mostRecentSelectedPoint === point) {
        this.mostRecentSelectedPoint = null;
        return;
      }

      // remove the tooltip
      d3.select(`.volcano-tooltip[name=${point.gene}]`).remove();
      this.activeGeneTooltips.splice(
        this.activeGeneTooltips.indexOf(point.gene),
        1
      );

      if (this.getActiveSelection().points.includes(point)) {
        return;
      }

      // see if the point has the "selected" class
      const isSelected = d3
        .select(`.point[name="${point.gene}"]`)
        .classed("selected");

      d3.select(`.point[name="${point.gene}"]`)
        .attr(
          "fill",
          isSelected
            ? VolcanoComponent.COLOR_SELECTED
            : VolcanoComponent.COLOR_UNSELECTED
        )
        .attr(
          "opacity",
          isSelected
            ? VolcanoComponent.OPACITY_SELECTED
            : VolcanoComponent.OPACITY
        );
    }, 1);
  }

  private emitSelectionUpdate(): void {
    // emit gets called when we programatically select a bunch of points, but we want to wait until the selection completes to emit
    if (this.artificallyHoldingShift) {
      return;
    }

    // sort each selection's points before emission
    this.selections.forEach(s => {
      s.points = [...s.points].sort((a, b) => {
        return Math.abs(b.x) - Math.abs(a.x);
      });
    })

    // we don't want selections to hang around in the table when all points are deselected in the volcano plot
    const standardSelectionPoints = this.selections.find(s => s.type === VolcanoSelectionType.Standard).points
    if (standardSelectionPoints.length === 0 && this.geneTable) {
      this.geneTable.selection.clear();
    }
    this.selections$.next(this.selections)
    this.cd.detectChanges();
  }

  private drawThresholdLines() {
    const svg = d3.select(`#${this.svgId}`);

    svg.selectAll(".threshold-line").remove();

    // Calculate the new positions based on the zoom transform
    const lowerLog2FoldChange = -Math.abs(
      this._selectByStatsForm.log2FoldChange
    );
    const upperLog2FoldChange = Math.abs(
      this._selectByStatsForm.log2FoldChange
    );

    const inRange = (value: number, range: number[]): boolean => {
      return value >= range[0] && value <= range[1];
    };

    [lowerLog2FoldChange, upperLog2FoldChange].forEach((x, i) => {
      // hide of the lines are beyond the limits of the graph x-axis

      svg
        .append("line")
        .attr("class", "threshold-line")
        .attr(
          "x1",
          this.zoomXScale(x) +
            VolcanoComponent.MARGIN.left +
            VolcanoComponent.AXIS_LABEL_PADDING
        )
        .attr("y1", VolcanoComponent.HEIGHT)
        .attr(
          "x2",
          this.zoomXScale(x) +
            VolcanoComponent.MARGIN.left +
            VolcanoComponent.AXIS_LABEL_PADDING
        )
        .attr("y2", 0)
        .attr("stroke", "black")
        .attr("stroke-dasharray", "5,5")
        .attr("opacity", Number(inRange(x, this.zoomXScale.domain())));
    });

    // Calculate the y position based on the current zoom transform
    const yThresholdY = this.zoomYScale(this._selectByStatsForm.nlogpadj);

    // Draw the -log10(padj) threshold line
    svg
      .append("line")
      .attr("class", "threshold-line")
      .attr(
        "x1",
        VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING
      )
      .attr(
        "y1",
        yThresholdY +
          VolcanoComponent.MARGIN.top +
          VolcanoComponent.TITLE_PADDING
      )
      .attr(
        "x2",
        VolcanoComponent.WIDTH +
          VolcanoComponent.MARGIN.left +
          VolcanoComponent.AXIS_LABEL_PADDING
      )
      .attr(
        "y2",
        yThresholdY +
          VolcanoComponent.MARGIN.top +
          VolcanoComponent.TITLE_PADDING
      )
      .attr("stroke", "black")
      .attr("stroke-dasharray", "5,5")
      .attr(
        "opacity",
        Number(
          inRange(this._selectByStatsForm.nlogpadj, this.zoomYScale.domain())
        )
      );
  }

  /**
   *  Returns true if the given point is within the given rectangle
   * @param { { x: number, y: number } } point
   * @param { { x: number, y: number }[] } rectPoints
   */
  private pointInRect(
    point: VolcanoPoint,
    rectPoints: Omit<VolcanoPoint, "gene" | "visibleLabel">[]
  ): boolean {
    const x = point.x;
    const y = point.y;
    const x1 = Math.min(rectPoints[0].x, rectPoints[1].x);
    const x2 = Math.max(rectPoints[0].x, rectPoints[1].x);
    const y1 = Math.min(rectPoints[0].y, rectPoints[1].y);
    const y2 = Math.max(rectPoints[0].y, rectPoints[1].y);

    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }

  private getEventCoords(event: MouseEvent) {
    // Get the position and dimensions of the SVG
    const svgElement = document.getElementById(this.svgId);
    const svgRect = svgElement.getBoundingClientRect();

    return {
      draw: {
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top,
      },
      domain: {
        x: this.zoomXScale.invert(
          event.clientX -
            svgRect.left -
            VolcanoComponent.MARGIN.left -
            VolcanoComponent.AXIS_LABEL_PADDING
        ),
        y: this.zoomYScale.invert(
          event.clientY -
            svgRect.top -
            VolcanoComponent.MARGIN.top -
            VolcanoComponent.TITLE_PADDING
        ),
      },
    };
  }

  private drawTooltipText(event) {
    const startCoords = this.eventCoords.draw;
    const endCoords = this.getEventCoords(event).draw;

    const startDomain = this.eventCoords.domain;
    const endDomain = this.getEventCoords(event).domain;

    d3.select(`#${this.svgId}`).selectAll(".drag-rectangle-text").remove();

    const shiftKeyPressed = event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = event.altKey;

    let color = "lightblue";
    let tooltipText = "Select subset of genes";
    if (altKeyPressed) {
      color = "#d16666";
      tooltipText = "Deselect subset of genes";
    }
    if (shiftKeyPressed) {
      tooltipText = "Add subset of genes to selection";
    }

    // if start and end coords are different, add them to the text
    if (startCoords.x !== endCoords.x || startCoords.y !== endCoords.y) {
      tooltipText += ` from (${startDomain.x.toPrecision(
        3
      )}, ${startDomain.y.toPrecision(3)}) to (${endDomain.x.toPrecision(
        3
      )}, ${endDomain.y.toPrecision(3)})`;
    }

    // add hint text at the starting point of the rectangle
    d3.select(`#${this.svgId}`)
      .append("text")
      .attr("class", "drag-rectangle-text")
      .attr("x", this.eventCoords.draw.x)
      .attr("y", this.eventCoords.draw.y - 3)
      .attr("fill", color)
      .attr("font-size", "12px")
      .text(tooltipText);
  }

  private stylePointOnHover(
    event: MouseEvent,
    point: VolcanoPoint,
    options: {
      tooltip?: boolean;
      fill?: string;
    } = {
      tooltip: true,
    }
  ) {
    if (this.isDragging) {
      return;
    }

    const activeSelectionConfig = this.getActiveSelection().config;

    // see if the point has the "selected" class
    const isSelected = d3
      .select(`.point[name="${point.gene}"]`)
      .classed("selected");

    const opacity = isSelected
      ? activeSelectionConfig.opacitySelected
      : activeSelectionConfig.opacityHover

    let fill = "";
    if (options.fill) {
      fill = options.fill;
    } else {
      // if the point is selected, keep the fill color the same
      if (!isSelected) {
        fill = activeSelectionConfig.colorUnselected;
      } else {
        fill = d3.select(`.point[name="${point.gene}"]`).attr("fill");
      }
    }

    // style the point based on whether it is selected
    d3.select(`.point[name="${point.gene}"]`)
      .attr("fill", fill)
      .attr("opacity", opacity);

    const tooltipAlreadyExists =
      d3.select(`.tooltip[name=${point.gene}]`).size() > 0;

    if (!tooltipAlreadyExists && options.tooltip && !activeSelectionConfig.disableTooltip) {
      this.drawTooltip(event, point);
    }
  }

  private stylePointsOnClick(
    event: MouseEvent,
    points: VolcanoPoint[],
    options?: {
      tooltip?: boolean;
      fill?: string;
    }
  ) {
    const DEFAULT_OPTIONS = {
      tooltip: true,
      fill: undefined,
    };
    options = { ...DEFAULT_OPTIONS, ...options };

    const selection = d3
      .select(`#${this.svgId}`)
      .selectAll(".point")
      .data(points, (d: VolcanoPoint) => d.gene);

    const selectedPoints = selection.filter(".selected");
    const unselectedPoints = selection.filter(":not(.selected)");

    const activeSelectionConfig = this.getActiveSelection().config;

    selectedPoints
      .attr(
        "fill",
        options.fill ? options.fill : activeSelectionConfig.colorUnselected
      )
      .attr("opacity", activeSelectionConfig.opacity)
      .classed("selected", false)
      .classed("upregulated", false)
      .classed("downregulated", false);

    unselectedPoints
      .attr("fill", (d) =>
        options.fill ? options.fill : this.getSelectedColor(d)
      )
      .attr("opacity", activeSelectionConfig.opacitySelected)
      .classed("selected", true)
      .classed("upregulated", (d) => this.getGeneRegulation(d) === "up")
      .classed("downregulated", (d) => this.getGeneRegulation(d) === "down");

    if (options.tooltip && !activeSelectionConfig.disableTooltip) {
      points.forEach((p) => this.drawTooltip(event, p));
    }
  }

  private stylePointOnClick(
    event: MouseEvent,
    point: VolcanoPoint,
    tooltip = true
  ) {
    this.stylePointsOnClick(event, [point], { tooltip });
  }

  // updateAxisRange(event: Event, minOrMax: "min" | "max") {
  //   // @ts-ignore
  //   const axis = event.target.name;
  //   // @ts-ignore
  //   const value = event.target.value;

  //   // xMin, xMax, yMin, yMax - axis followed by uppercase minOrMax
  //   const axisRangesAttr =
  //     axis + minOrMax.charAt(0).toUpperCase() + minOrMax.slice(1);
  //   this.axisRanges[axisRangesAttr] = value;

  //   if (axis == "x") {
  //     // adjust negative to positive value range for x axis (LogFC)
  //     this.xScale.domain([
  //       minOrMax === "min" ? value : this.xScale.domain()[0],
  //       minOrMax === "max" ? value : this.xScale.domain()[1],
  //     ]);
  //     this.xAxis.transition().duration(1000).call(d3.axisBottom(this.xScale));
  //   } else if (axis == "y") {
  //     this.yScale.domain([
  //       minOrMax === "min" ? value : this.yScale.domain()[0],
  //       minOrMax === "max" ? value : this.yScale.domain()[1],
  //     ]);
  //     this.yAxis.transition().duration(1000).call(d3.axisLeft(this.yScale));
  //   } else {
  //     throw Error(`Unknown axis ${axis}`);
  //   }

  //   // Filter out data points beyond the updated axis limits
  //   const filteredData = this.points.filter((d) => {
  //     const xWithinLimits =
  //       d.x >= this.xScale.domain()[0] && d.x <= this.xScale.domain()[1];
  //     const yWithinLimits =
  //       d.y >= this.yScale.domain()[0] && d.y <= this.yScale.domain()[1];
  //     return xWithinLimits && yWithinLimits;
  //   });

  //   // Update the circles within the new limits
  //   this.plot
  //     .selectAll("circle")
  //     .data(filteredData, (d: VolcanoPoint) => d.gene) // Use a key function to bind data
  //     .transition()
  //     .duration(1000)
  //     .attr("cx", (d) => this.xScale(d.x))
  //     .attr("cy", (d) => this.yScale(d.y))
  //     .attr("opacity", (d) =>
  //       this.getActiveSelection().points.includes(d)
  //         ? VolcanoComponent.OPACITY_SELECTED
  //         : VolcanoComponent.OPACITY
  //     );

  //   // hide circles outside of axis limits
  //   this.plot
  //     .selectAll("circle")
  //     .data(this.points, (d: VolcanoPoint) => d.gene) // Rebind the data
  //     .filter((d) => !filteredData.includes(d)) // Select circles that are not in filteredData
  //     .attr("opacity", 0); // Set opacity to hide them
  // }

  private drawData(
    xScale: d3.ScaleLinear<any, any, any> = this.xScale,
    yScale: d3.ScaleLinear<any, any, any> = this.yScale
  ) {

    const activeSelectionConfig = this.getActiveSelection().config;

    this.plot
      .selectAll("circle")
      .data(this._points)
      .enter()
      .append("circle")
      .attr("class", "point")
      .attr("name", (d) => d.gene)
      .attr(
        "cx",
        (d) =>
          xScale(d.x) +
          VolcanoComponent.MARGIN.left +
          VolcanoComponent.AXIS_LABEL_PADDING
      )
      .attr(
        "cy",
        (d) =>
          yScale(d.y) +
          VolcanoComponent.MARGIN.top +
          VolcanoComponent.TITLE_PADDING
      )
      .attr("r", VolcanoComponent.POINT_RADIUS)
      .attr("fill", activeSelectionConfig.colorUnselected)
      .attr("stroke", "none")
      .attr("opacity", activeSelectionConfig.opacity)
      // @ts-ignore
      .on("mouseover", (e, d) => this.onPointMouseOver(e, d))
      .on("mouseout", (e, d) => this.onPointMouseOut(e, d))
      .on("click", (e, d) => this.onPointClick(e, d));
  }

  private drawTooltip(event: MouseEvent, point: VolcanoPoint, opacity = 1) {
    // Remove the tooltip for this point if it already exists
    d3.select(`.volcano-tooltip[name=${point.gene}]`).remove();
    this.activeGeneTooltips.splice(
      this.activeGeneTooltips.indexOf(point.gene),
      1
    );

    // const cnaData = OncoData.instance.currentCommonSidePanel.getCnaDataForGene(
    //   point.gene
    // );
    const cnaData = {
      min: "--",
      max: "--",
      mean: 0,
    };

    let detailsHtml = `
      <hr />
      <a target="_blank" href="https://www.genecards.org/cgi-bin/carddisp.pl?gene=${point.gene}">GeneCard</a> |
      <a target="_blank" href="https://cancer.sanger.ac.uk/cosmic/gene/analysis?ln=${point.gene}">COSMIC</a>
    `;

    let title = point.gene;
    if (title.length > 40) {
      let shortTitle = title.substring(0, 39) + "…";
      title = `<a class="no-decorate-unhovered-tooltip" href="#" onclick="alert('ID: ${title}');">${shortTitle}</a>`;
    }

    // TODO: Is it worth calculating CNA data just for this iterative standalone application?
    if (cnaData) {
      detailsHtml += `
      <hr />
      CNA: Min=${cnaData.min} Max=${cnaData.max} Mean=${(
        cnaData.mean as number
      ).toPrecision(4)}<br />
      `;
    }

    const html = `
    <span class="xtooltiptext" style="opacity: ${opacity}">
      <span ><img
        style="vertical-align:middle" src="./assets/icons/freepik/dna-chain.png" width="16" height="16" />
        &nbsp;<b>${title}</b>
        <div class="xtooltipexpando">${detailsHtml}</div>
      </span>
    </span>
    `;

    d3.select(`body`)
      .append("div")
      .attr("class", "volcano-tooltip")
      .attr("name", point.gene)
      .style("position", "absolute")
      // the differential-expression-panel has a z-index of 100 since it is an overlay
      .style("z-index", "1000")
      .style("left", event.pageX + 20 + "px")
      .style("top", event.pageY - 20 + "px")
      .html(html)
      .on("mouseover", () => this.onTooltipMouseOver(event, point))
      .on("mouseout", () => this.onTooltipMouseOut(event, point));

    this.activeGeneTooltips.push(point.gene);
  }

  private handleZoom(event: d3.D3ZoomEvent<any, VolcanoPoint>) {
    if (this._mode !== VolcanoInteractivityMode.PAN_ZOOM) {
      return;
    }

    const activeSelectionConfig = this.getActiveSelection().config;

    const zt = event.transform;

    // Update the x-axis and y-axis based on the zoom transformation
    this.zoomXScale = zt.rescaleX(this.xScale);
    this.zoomYScale = zt.rescaleY(this.yScale);
    this.xAxis.call(d3.axisBottom(this.zoomXScale));
    this.yAxis.call(d3.axisLeft(this.zoomYScale));

    this.drawThresholdLines();

    //#region Update Point and Label positions, event listeners, and stylings

    const inAxisLimits = (d: VolcanoPoint) => {
      const xWithinLimits =
        d.x >= this.zoomXScale.domain()[0] &&
        d.x <= this.zoomXScale.domain()[1];
      const yWithinLimits =
        d.y >= this.zoomYScale.domain()[0] &&
        d.y <= this.zoomYScale.domain()[1];
      return xWithinLimits && yWithinLimits;
    };

    const pointsInAxisLimits = this._points.filter(inAxisLimits);
    const pointsNotInAxisLimits = this._points.filter(
      (d) => !pointsInAxisLimits.includes(d)
    );

    const labelInAxisLimits = (_, i: number, nodes: any): boolean => {
      const node = nodes[i];
      const gene: string = node.attributes.name.value;
      return pointsInAxisLimits.find((p) => p.gene == gene) !== undefined;
    };

    // enable points in axis limits
    const xOffset =
      (VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING) *
      (1 / zt.k);
    const yOffset =
      (VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING) *
      (1 / zt.k);
    this.plot
      .selectAll("circle")
      .data(pointsInAxisLimits, (d: VolcanoPoint) => d.gene)
      // reposition
      .attr("cx", (d: VolcanoPoint) => this.xScale(d.x) + xOffset)
      .attr("cy", (d: VolcanoPoint) => this.yScale(d.y) + yOffset)
      .attr("r", VolcanoComponent.POINT_RADIUS * (1 / zt.k))

      // add event listeners back
      // @ts-ignore
      .on("mouseover", (e, d) => this.onPointMouseOver(e, d))
      .on("mouseout", (e, d) => this.onPointMouseOut(e, d))
      .on("click", (e, d) => this.onPointClick(e, d))

      // make points visible again
      .attr("opacity", (d) =>
        this.getActiveSelection().points.includes(d)
          ? activeSelectionConfig.opacitySelected
          : activeSelectionConfig.opacity
      )
      .classed("out-of-view", false);

    // show labels in axis limits
    this.plot
      .selectAll(".volcano-label")
      .filter(labelInAxisLimits)
      .attr("display", "inherit");

    // hide points outside axis limits
    this.plot
      .selectAll("circle")
      .data(pointsNotInAxisLimits, (d: VolcanoPoint) => d.gene)
      .attr("opacity", 0) // Set opacity to hide them
      // disable event listeners
      .on("mouseover", null)
      .on("mouseout", null)
      .on("click", null)
      .classed("out-of-view", true);

    // hide labels outside axis limits
    this.plot
      .selectAll(".volcano-label")
      .filter((_, i, nodes) => !labelInAxisLimits(_, i, nodes))
      .attr("display", "none");

    //#endregion

    // Apply the zoom transformation to the plot container
    // @ts-ignore
    this.plot.attr("transform", zt);
  }

  // #endregion

  // #region lifecycle events

  ngAfterViewInit(): void {
    this.svgId = `volcano-${this.id}`;
    const { data: processedData, genesToSelectByDefault } = this.processData(
      this.data,
      this.genesToSelectByDefault
    );
    this._points = processedData;
    // this.dataBoundingBox = {
    //   xMin: Number(Math.min(...this.points.map((p) => p.x)).toFixed(3)),
    //   xMax: Number(Math.max(...this.points.map((p) => p.x)).toFixed(3)),
    //   yMin: Number(Math.min(...this.points.map((p) => p.y)).toFixed(3)),
    //   yMax: Number(Math.max(...this.points.map((p) => p.y)).toFixed(3)),
    // };

    // clear out the container
    d3.select(`#${this.svgId}`).selectAll("*").remove();

    const width =
      VolcanoComponent.WIDTH +
      VolcanoComponent.MARGIN.left +
      VolcanoComponent.MARGIN.right +
      VolcanoComponent.AXIS_LABEL_PADDING;

    const height =
      VolcanoComponent.HEIGHT +
      VolcanoComponent.MARGIN.top +
      VolcanoComponent.MARGIN.bottom +
      VolcanoComponent.TITLE_PADDING +
      VolcanoComponent.AXIS_LABEL_PADDING;

    const svg = d3
      .select(`#${this.svgId}`)
      .attr("width", width)
      .attr("height", height)
      // @ts-ignore
      .attr("viewBox", [0, 0, width, height]);

    // @ts-ignore
    this.plot = svg
      .append("g")
      .attr(
        "transform",
        `translate(${
          VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING
        }, ${VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING})`
      );

    this.domain = {
      x: [d3.min(this._points, (d) => d.x), d3.max(this._points, (d) => d.x)],
      y: [d3.min(this._points, (d) => d.y), d3.max(this._points, (d) => d.y)],
    };

    const paddedDomain = {
      x: [
        this.domain.x[0] - VolcanoComponent.DATA_PADDING.left,
        this.domain.x[1] + VolcanoComponent.DATA_PADDING.right,
      ],
      y: [
        this.domain.y[0] - VolcanoComponent.DATA_PADDING.bottom,
        this.domain.y[1] + VolcanoComponent.DATA_PADDING.top,
      ],
    };

    this.xScale = d3
      .scaleLinear()
      .domain(paddedDomain.x)
      .range([0, VolcanoComponent.WIDTH]);
    this.zoomXScale = this.xScale;

    this.yScale = d3
      .scaleLinear()
      .domain(paddedDomain.y)
      .range([
        VolcanoComponent.HEIGHT -
          VolcanoComponent.MARGIN.top -
          VolcanoComponent.TITLE_PADDING,
        0,
      ]);
    this.zoomYScale = this.yScale;

    // set up zoom
    this.zoom = d3
      .zoom()
      .scaleExtent([0.5, 5])
      .on("zoom", this.handleZoom.bind(this));
    svg.call(this.zoom);

    // for each point in the data draw a circle
    this.drawData();

    // Add x-axis label
    svg
      .append("text")
      .attr("class", "x-axis-label")
      .attr("x", VolcanoComponent.WIDTH / 2)
      .attr("y", VolcanoComponent.HEIGHT + VolcanoComponent.MARGIN.bottom)
      .attr("text-anchor", "middle")
      .text(`Log2 Fold Change`);

    // Add y-axis label
    svg
      .append("text")
      .attr("class", "y-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -VolcanoComponent.HEIGHT / 2)
      .attr("y", VolcanoComponent.AXIS_LABEL_PADDING)
      .attr("text-anchor", "middle")
      .text("-log10(p-adjusted)");

    // Add a title
    // svg
    //   .append("text")
    //   .attr("class", "title")
    //   .attr("x", VolcanoComponent.WIDTH / 2)
    //   .attr("y", -VolcanoComponent.MARGIN.top)
    //   .attr("text-anchor", "middle")
    //   .text("Differential Expression Volcano Plot")
    //   .style("font-size", "20px")
    //   .style("font-weight", "bold")

    // Add x-axis ticks
    // @ts-ignore
    this.xAxis = svg
      .append("g")
      .attr("class", "x-axis")
      .attr(
        "transform",
        `translate(${
          VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING
        }, ${VolcanoComponent.HEIGHT})`
      )
      // @ts-ignore
      .call(d3.axisBottom(this.xScale));

    // Add y-axis ticks
    // @ts-ignore
    this.yAxis = svg
      .append("g")
      .attr("class", "y-axis")
      .attr(
        "transform",
        `translate(${
          VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING
        }, ${VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING})`
      )
      // @ts-ignore
      .call(d3.axisLeft(this.yScale));

    // Some weird stuff happens with point placement if we don't trigger zoom first. To fix this, reset the view, which briefly goes into zoom/pan mode and sets the zoom and origin to 0
    this.resetView();

    this.selectByStats();
    this.emitSelectionUpdate();
  }

  ngOnInit(): void {

    this.selections$.next(this.selections)

    // listen for window size changes
    window.addEventListener("resize", () => {
      VolcanoComponent.WIDTH =
        Number(window.getComputedStyle(document.body).width.replace("px", "")) /
        2;
      VolcanoComponent.HEIGHT =
        Number(
          window.getComputedStyle(document.body).height.replace("px", "")
        ) / 1.5;
      // this.ngAfterViewInit();
    });
  }

  // #endregion

  constructor(private cd: ChangeDetectorRef) {}
}
