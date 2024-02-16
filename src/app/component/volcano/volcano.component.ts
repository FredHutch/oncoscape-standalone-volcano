import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  ViewChild,
} from "@angular/core";
// import { OncoData } from "app/oncoData";
import * as d3 from "d3";

// override d3 to have types for d3.event
declare global {
  namespace d3 {
    export let event: MouseEvent;
  }
}

import { VolcanoGeneTableComponent } from "./volcano-gene-table/volcano-gene-table.component";

export type Point = { x: number; y: number; gene: string };

@Component({
  selector: "app-visualization-volcano",
  templateUrl: "./volcano.component.html",
  styleUrls: ["./volcano.component.scss"],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class VolcanoComponent implements AfterViewInit, OnInit {
  static readonly OPACITY = 0.2;
  static readonly OPACITY_HOVER = 0.5;
  static readonly OPACITY_SELECTED = 1;
  static readonly AXIS_LABEL_PADDING = 20;
  static readonly TITLE_PADDING = 20;
  static readonly MARGIN = { top: 20, right: 20, bottom: 30, left: 30 };
  static WIDTH = Number(window.getComputedStyle(document.body).width.replace('px', '')) / 2
  static HEIGHT = Number(window.getComputedStyle(document.body).height.replace('px', '')) / 1.5
  static readonly COLOR_UNSELECTED = "gray";
  static readonly COLOR_SELECTED = "#455ca3";
  static readonly POINT_RADIUS = 3;
  static readonly LABEL_OFFSET = {
    x: 4,
    y: -4
    // x: 20,
    // y: -15,
  }

  @Input() data: Object;
  @Input() genesToSelectByDefault: string[] = [];
  @Input() id: string;

  @ViewChild(VolcanoGeneTableComponent, {static: false}) geneTable: VolcanoGeneTableComponent;

  private svgId: string = "";
  private isDragging = false;
  private artificallyHoldingShift = false;
  private points: Point[] = [];

  // this intermittently gets updated. Look to emittedPoints for the final selection
  private selectedPoints: Point[] = [];
  public emittedPoints: Point[] = [];

  public selectByStatsForm: {
    nlogpadj: number;
    log2FoldChange: number;
  } = {
    nlogpadj: 1.301,
    log2FoldChange: 0.58,
  };

  // this is the most recent selected point, if any.
  public mostRecentSelectedPoint: Point = null;

  // Keep track of how points change during a drag, so we can reverse when the rectangle moves off of them
  // These will reset on mouseup
  private pointsNewToThisDrag = [];
  private pointsDeletedThisDrag = [];

  // The names of the genes that has a visible tooltip
  private activeGeneTooltips: string[] = [];

  private eventCoords: {
    draw: { x: number; y: number };
    domain: { x: number; y: number };
  };
  private xScale: d3.ScaleLinear<number, number>;
  private yScale: d3.ScaleLinear<number, number>;
  private domain: { x: [number, number]; y: [number, number] };
  private hovered: Point;

  // #region Helper Functions

  selectAll() {
    this.clearSelection();
    this.points.forEach((point) => {
      this.selectedPoints.push(point);
      this.stylePointOnClick(d3.event, point);
    });
    this.emitSelectionUpdate();
  }

  /**
   * Regardless of how the data looks coming in, we want to transform it to the following format:
   * [
   * {x: number, y: number, gene: string},
   * ]
   */
  processData(
    data: Object,
    genesToSelectByDefault = []
  ): {
    data: Point[];
    genesToSelectByDefault: string[];
    genes: string[];
  } {
    const genes = Object.keys(data["geneID"]);
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

    let finalData: Point[] = x.map((xValue, i) => {
      return {
        x: xValue,
        y: y[i],
        gene: genes[i],
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

  // Called by things like Oncoscape legend clicks
  selectGenesByName(genes: string[], options: {
    label?: boolean;
    fill?: string;
  } = {label: false}): void {

    const pointsToClick = this.points.filter((p) => genes.includes(p.gene))
    this.stylePointsOnClick(d3.event, pointsToClick, {tooltip: false, fill: options.fill});
    this.selectedPoints.push(...pointsToClick);

    if (options.label) {
      this.labelPoints(this.selectedPoints);
    }
  }

  // This will eventually be replaced with an Oncoscape call instead of the current html page updates
  emitSelectionUpdate(): void {

    // emit gets called when we programatically select a bunch of points, but we want to wait until the selection completes to emit
    if (this.artificallyHoldingShift) {
      return
    }

    const sortedSelectedPoints = [...this.selectedPoints].sort((a, b) => {
      return Math.abs(b.x) - Math.abs(a.x);
    });

    // we don't want selections to hang around in the table when all points are deselected in the volcano plot
    if (sortedSelectedPoints.length === 0) {
      this.geneTable.selection.clear()
    }

    this.emittedPoints = sortedSelectedPoints
    console.log('emitting', this.emittedPoints);
    this.cd.detectChanges();
  }

  clearSelection() {
    // clear out the selected cohort subsets
    this.selectedPoints.length = 0;

    // reset the points to unselected style
    d3.selectAll(".point")
      .attr("fill", VolcanoComponent.COLOR_UNSELECTED)
      .attr("opacity", VolcanoComponent.OPACITY)
      .classed("selected", false);

    // remove all tooltips
    d3.selectAll(".volcano-tooltip").remove();
    this.activeGeneTooltips.length = 0;

    // remove threshold lines
    d3.select(`#${this.svgId}`).selectAll(".threshold-line").remove();

    this.labelPoints([]);

    // emit the new cleared selection so other elements on the page can respond
    this.emitSelectionUpdate();
  }

  /**
   * Select up and down regulated genes by -log10(padj) and log2FoldChange thresholds
   * @param padj the adjusted p-value
   * @param log2FoldChange The log2 fold change
   */
  selectByStats(nlogpadj: number, log2FoldChange: number) {

    // find all points that are above the -log10(padj) line and greater than the absolute value of log2FoldChange
    const upregulatedPoints = this.points.filter(
      (point) => point.x > log2FoldChange && point.y > nlogpadj
    );

    const downregulatedPoints = this.points.filter(
      (point) => point.x < -log2FoldChange && point.y > nlogpadj
    );
    this.clearSelection();

    this.selectGenesByName(
      downregulatedPoints.map((p) => p.gene),
      {fill: "red"}
    );

    this.selectGenesByName(
      upregulatedPoints.map((p) => p.gene),
      {fill: "green"}
    );



    // draw dashed lines to show the thresholds
    this.drawThresholdLines(nlogpadj, log2FoldChange);

    this.emitSelectionUpdate();
  }

  private drawThresholdLines(nlogpadj: number, log2FoldChange: number) {
    d3.select(`#${this.svgId}`).selectAll(".threshold-line").remove();


    // draw the log2FoldChange threshold lines
    const lowerLog2FoldChange = -Math.abs(log2FoldChange);
    const upperLog2FoldChange = Math.abs(log2FoldChange);
    [lowerLog2FoldChange, upperLog2FoldChange].forEach((x) => {
      d3.select(`#${this.svgId}`)
        .append("line")
        .attr("class", "threshold-line")
        .attr("x1", this.xScale(x) + VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING)
        .attr("y1", this.yScale(0) + VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING)
        .attr("x2", this.xScale(x) + VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING)
        .attr("y2", VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING)
        .attr("stroke", "black")
        .attr("stroke-dasharray", "5,5");
    });

    // draw the -log10(padj) threshold line
    d3.select(`#${this.svgId}`)
      .append("line")
      .attr("class", "threshold-line")
      .attr("x1", this.xScale(this.domain.x[0]) + VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING)
      .attr("y1", this.yScale(nlogpadj) + VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING)
      .attr("x2", this.xScale(this.domain.x[1]) + VolcanoComponent.MARGIN.left)
      .attr("y2", this.yScale(nlogpadj) + VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING)
      .attr("stroke", "black")
      .attr("stroke-dasharray", "5,5");
  }

  /**
   *  Returns true if the given point is within the given rectangle
   * @param { { x: number, y: number } } point
   * @param { { x: number, y: number }[] } rectPoints
   */
  private pointInRect(
    point: Point,
    rectPoints: Omit<Point, "gene">[]
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
        x: this.xScale.invert(
          event.clientX -
            svgRect.left -
            VolcanoComponent.MARGIN.left -
            VolcanoComponent.AXIS_LABEL_PADDING
        ),
        y: this.yScale.invert(
          event.clientY -
            svgRect.top -
            VolcanoComponent.MARGIN.top -
            VolcanoComponent.TITLE_PADDING
        ),
      },
    };
  }

  private drawTooltipText() {

    const startCoords = this.eventCoords.draw;
    const endCoords = this.getEventCoords(d3.event).draw;

    const startDomain = this.eventCoords.domain;
    const endDomain = this.getEventCoords(d3.event).domain;

    d3.select(`#${this.svgId}`).selectAll(".drag-rectangle-text").remove();

    const shiftKeyPressed = d3.event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = d3.event.altKey;

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
      tooltipText += ` from (${startDomain.x.toPrecision(3)}, ${startDomain.y.toPrecision(3)}) to (${endDomain.x.toPrecision(3)}, ${endDomain.y.toPrecision(3)})`
    }

    console.log('tooltipText', tooltipText)

    // add hint text at the starting point of the rectangle
    d3.select(`#${this.svgId}`)
      .append("text")
      .attr("class", "drag-rectangle-text")
      .attr("x", this.eventCoords.draw.x)
      .attr("y", this.eventCoords.draw.y - 3)
      .attr("fill", color)
      .attr("font-size", "12px")
      .text(tooltipText)
  }

  // #endregion

  // #region Event Listeners

  onMouseDown(event) {
    // return on right click
    if (d3.event.button == 2) {
      return;
    }

    const shiftKeyPressed = d3.event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = d3.event.altKey;

    if (shiftKeyPressed && altKeyPressed) {
      // if both shift and alt are pressed, do nothing
      return;
    }

    // If the mouse is over a point, do nothing. Let the point's click event handle it.
    if (this.hovered) {
      return;
    }

    const anyModifierKeyPressed = shiftKeyPressed || altKeyPressed;
    if (!anyModifierKeyPressed) {
      // if no modifier keys are pressed, clear the selection
      this.clearSelection();
    }

    this.isDragging = true;
    this.eventCoords = this.getEventCoords(d3.event);

    // remove any existing rectangle
    d3.select(`#${this.svgId}`).selectAll(".drag-rectangle").remove();

    this.drawTooltipText();
  }

  onMouseMove() {
    const shiftKeyPressed = d3.event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = d3.event.altKey;

    // if both shift and alt are pressed, do nothing
    if (shiftKeyPressed && altKeyPressed) {
      return;
    }

    if (this.isDragging) {
      // remove any existing rectangle
      d3.select(`#${this.svgId}`).selectAll(".drag-rectangle").remove();
      d3.select(`#${this.svgId}`).selectAll(".drag-rectangle-coordinates").remove();

      let color = altKeyPressed ? "#d16666" : "lightblue";

      // get start and current coordinates
      const startDomain = this.eventCoords.domain;
      const currentDomain = this.getEventCoords(d3.event).domain;
      const startDraw = this.eventCoords.draw;
      const currentDraw = this.getEventCoords(d3.event).draw;

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

      this.drawTooltipText();

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

      const toClick: Point[] = [];

      const deselectPoint = (p: Point) => {
        this.selectedPoints.splice(this.selectedPoints.indexOf(p), 1);
        toClick.push(p);
      };

      const selectPoint = (p: Point) => {
        this.selectedPoints.push(p);
        toClick.push(p);
      };

      this.points.forEach((point) => {
        const inRect = this.pointInRect(point, rectCoords);
        const wasAlreadySelected = this.selectedPoints.includes(point);
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
      this.stylePointsOnClick(d3.event, toClick, {tooltip: false});
    }
  }

  onMouseUp() {
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

  onTooltipMouseOver(event: MouseEvent, point: Point) {
    this.activeGeneTooltips.push(point.gene);
  }

  onTooltipMouseOut(event: MouseEvent, point: Point) {
    this.onPointMouseOut(event, point);
  }

  onPointMouseOver(event: MouseEvent, point: Point) {

    // don't call the same hover event twice
    if (this.hovered == point) {
      return;
    }

    this.hovered = point;
    this.stylePointOnHover(event, point);
  }

  onPointClick(event, point) {
    const shiftPressed = d3.event.shiftKey || this.artificallyHoldingShift;
    const altKeyPressed = d3.event.altKey;

    const alreadySelected = this.selectedPoints.includes(point);
    const somethingIsSelected = this.selectedPoints.length > 0;
    if (somethingIsSelected) {
      if (altKeyPressed) {
        if (this.selectedPoints.includes(point)) {
          // the point is already selected with alt pressed
          // Expected behavior is to remove this point from the selection
          this.selectedPoints.splice(this.selectedPoints.indexOf(point), 1);
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
          this.selectedPoints.splice(this.selectedPoints.indexOf(point), 1);
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

          this.selectedPoints.push(point);
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
        this.selectedPoints.push(point);
        this.mostRecentSelectedPoint = point;

        // because the order of operations for putting the point back in focus, we need to manually call drawTooltip
        this.drawTooltip(event, point);
        this.emitSelectionUpdate();
        return;
      }
    }

    this.mostRecentSelectedPoint = point;
    this.selectedPoints.push(point);
    this.stylePointOnClick(event, point);
    this.emitSelectionUpdate();
  }
  onPointMouseOut(event, point) {

    this.hovered = null;

    if (this.mostRecentSelectedPoint === point) {
      this.mostRecentSelectedPoint = null;
      return;
    }

    // remove the tooltip
    d3.select(`.volcano-tooltip[name=${point.gene}]`).remove();

    if (this.selectedPoints.includes(point)) {
      return;
    }

    // see if the point has the "selected" class
    const isSelected = d3
      .select(`.point[name="${point.gene}"]`)
      .classed("selected");

    const opacity = isSelected
      ? VolcanoComponent.OPACITY_SELECTED
      : VolcanoComponent.OPACITY;

    let fill = ""
    if (isSelected) {
      fill = d3.select(`.point[name="${point.gene}"]`).attr("fill");
    } else {
      fill = VolcanoComponent.COLOR_UNSELECTED;
    }

    d3.select(`.point[name="${point.gene}"]`)
      .attr(
        "fill",
        fill
      )
      .attr(
        "opacity",
        opacity
      );

    // immediately remove the tooltip from the list of active tooltips when the mouse leaves. If the tooltip's mouseover event is called, it will be added back to the list before the timeout
    // this.activeGeneTooltips.splice(
    //   this.activeGeneTooltips.indexOf(point.gene),
    //   1
    // );

    // setTimeout(() => {

    //   // After the timeout, if the tooltip is still active, then that means the user has hovered over the tooltip
    //   if (this.activeGeneTooltips.includes(point.gene)) {
    //     return;
    //   }

    //   this.hovered = null;

    //   if (this.mostRecentSelectedPoint === point) {
    //     this.mostRecentSelectedPoint = null;
    //     return;
    //   }

    //   // remove the tooltip
    //   d3.select(`.volcano-tooltip[name=${point.gene}]`).remove();
    //   this.activeGeneTooltips.splice(
    //     this.activeGeneTooltips.indexOf(point.gene),
    //     1
    //   );

    //   if (this.selectedPoints.includes(point)) {
    //     return;
    //   }

    //   // see if the point has the "selected" class
    //   const isSelected = d3
    //     .select(`.point[name="${point.gene}"]`)
    //     .classed("selected");

    //   d3.select(`.point[name="${point.gene}"]`)
    //     .attr(
    //       "fill",
    //       isSelected
    //         ? VolcanoComponent.COLOR_SELECTED
    //         : VolcanoComponent.COLOR_UNSELECTED
    //     )
    //     .attr(
    //       "opacity",
    //       isSelected
    //         ? VolcanoComponent.OPACITY_SELECTED
    //         : VolcanoComponent.OPACITY
    //     );
    // }, 1);
  }

  labelPoints(points: Point[]) {

    // clear out any existing labels
    d3.selectAll(`.volcano-label`).remove();
    d3.selectAll(`.volcano-label-line`).remove();

    points.forEach((point) => {
      const point_ = this.points.find((p) => p.gene === point.gene);
      if (point_) {
        const x = this.xScale(point_.x) + VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING;
        const y = this.yScale(point_.y) + VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING;

        // // add a rectangle behind the text
        // d3.select(`#${this.svgId}`).append("rect")
        //   .attr("class", "volcano-label")
        //   .attr("x", x + VolcanoComponent.LABEL_OFFSET.x - 2)
        //   .attr("y", y + VolcanoComponent.LABEL_OFFSET.y - 12)
        //   .attr("width", 10)
        //   .attr("height", 10)
        //   .attr("fill", "white");


        d3.select(`#${this.svgId}`).append("text")
          .attr("class", "volcano-label")
          .attr("x", x + VolcanoComponent.LABEL_OFFSET.x)
          .attr("y", y + VolcanoComponent.LABEL_OFFSET.y)
          .attr('font-size', '10px')
          .attr('font-weight', 'bold')
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

  stylePointOnHover(event: MouseEvent, point: Point, options: {
    tooltip?: boolean;
    fill?: string;
  } = {
    tooltip: true,
  }) {
    if (this.isDragging) {
      return;
    }

    // see if the point has the "selected" class
    const isSelected = d3
      .select(`.point[name="${point.gene}"]`)
      .classed("selected");

    const opacity = isSelected
      ? VolcanoComponent.OPACITY_SELECTED
      : VolcanoComponent.OPACITY_HOVER;

    let fill = ""
    if (options.fill) {
      fill = options.fill;
    } else {
      // if the point is selected, keep the fill color the same
      if (!isSelected) {
        fill = VolcanoComponent.COLOR_UNSELECTED;
      } else {
        fill = d3.select(`.point[name="${point.gene}"]`).attr("fill");
      }
    }

    // style the point based on whether it is selected
    d3.select(`.point[name="${point.gene}"]`)
      .attr("fill", fill)
      .attr(
        "opacity",
        opacity
      );

    const tooltipAlreadyExists = d3.select(`.tooltip[name=${point.gene}]`).size() > 0;

    if (!tooltipAlreadyExists && options.tooltip) {
      this.drawTooltip(event, point);
    }
  }

  stylePointsOnClick(event: MouseEvent, points: Point[], options?: {
    tooltip?: boolean;
    fill?: string;
  }) {
    const DEFAULT_OPTIONS = {
      tooltip: true,
      fill: undefined
    };
    options = { ...DEFAULT_OPTIONS, ...options };

    const selection = d3
      .select(`#${this.svgId}`)
      .selectAll(".point")
      .data(points, (d: Point) => d.gene);

    const selectedPoints = selection.filter(".selected");
    const unselectedPoints = selection.filter(":not(.selected)");

    selectedPoints
      .attr("fill", options.fill ? options.fill : VolcanoComponent.COLOR_UNSELECTED)
      .attr("opacity", VolcanoComponent.OPACITY)
      .classed("selected", false);

    unselectedPoints
      .attr("fill", options.fill ? options.fill : VolcanoComponent.COLOR_SELECTED)
      .attr("opacity", VolcanoComponent.OPACITY_SELECTED)
      .classed("selected", true);

    if (options.tooltip) {
      points.forEach((p) => this.drawTooltip(event, p));
    }
  }

  stylePointOnClick(event: MouseEvent, point: Point, tooltip = true) {
    this.stylePointsOnClick(event, [point], {tooltip});
  }

  private drawTooltip(
    event: MouseEvent,
    point: Point,
    opacity = 1
  ) {

    // Remove the tooltip for this point if it already exists
    d3.select(`.volcano-tooltip[name=${point.gene}]`).remove();
    this.activeGeneTooltips.splice(
      this.activeGeneTooltips.indexOf(point.gene),
      1
    );

    const cnaData = {
      min: "--",
      max: "--",
      mean: "--",
    }

    // OncoData.instance.currentCommonSidePanel.getCnaDataForGene(
    //   point.gene
    // );

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
    // if (cnaData) {
    //   detailsHtml += `
    //   <hr />
    //   CNA: Min=${cnaData.min} Max=${cnaData.max} Mean=${cnaData.mean}<br />
    //   `;
    //   // detailsHtml += `
    //   // <hr />
    //   // CNA: Min=${cnaData.min} Max=${cnaData.max} Mean=${(
    //   //   cnaData.mean as number
    //   // ).toPrecision(4)}<br />
    //   // `;
    // }

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
      .style("z-index", "101")
      .style("left", (event.pageX + 20) + "px")
      .style("top", (event.pageY - 20) + "px")
      .html(html)
      // .on("mouseover", () => this.onTooltipMouseOver(event, point))
      // .on("mouseout", () => this.onTooltipMouseOut(event, point));

    this.activeGeneTooltips.push(point.gene);
  }

  // #endregion

  ngAfterViewInit(): void {
    this.svgId = `volcano-${this.id}`;
    const { data: processedData, genesToSelectByDefault } = this.processData(
      this.data,
      this.genesToSelectByDefault
    );
    this.points = processedData;

    // clear out the container
    d3.select(`#${this.svgId}`).selectAll("*").remove();

    const svg = d3
      .select(`#${this.svgId}`)
      .attr(
        "width",
        VolcanoComponent.WIDTH +
          VolcanoComponent.MARGIN.left +
          VolcanoComponent.MARGIN.right +
          VolcanoComponent.AXIS_LABEL_PADDING
      )
      .attr(
        "height",
        VolcanoComponent.HEIGHT +
          VolcanoComponent.MARGIN.top +
          VolcanoComponent.MARGIN.bottom +
          VolcanoComponent.TITLE_PADDING +
          VolcanoComponent.AXIS_LABEL_PADDING
      )
      .append("g")
      .attr(
        "transform",
        `translate(${
          VolcanoComponent.MARGIN.left + VolcanoComponent.AXIS_LABEL_PADDING
        }, ${VolcanoComponent.MARGIN.top + VolcanoComponent.TITLE_PADDING})`
      );

    this.domain = {
      x: [d3.min(this.points, (d) => d.x), d3.max(this.points, (d) => d.x)],
      y: [d3.min(this.points, (d) => d.y), d3.max(this.points, (d) => d.y)],
    };
    this.xScale = d3
      .scaleLinear()
      .domain(this.domain.x)
      .range([0, VolcanoComponent.WIDTH]);

    this.yScale = d3
      .scaleLinear()
      .domain(this.domain.y)
      .range([VolcanoComponent.HEIGHT, 0]);

    // for each point in the data draw a circle
    svg
      .selectAll("circle")
      .data(this.points)
      .enter()
      .append("circle")
      .attr("class", "point")
      .attr("name", (d) => d.gene)
      .attr("cx", (d) => this.xScale(d.x))
      .attr("cy", (d) => this.yScale(d.y))
      .attr("r", VolcanoComponent.POINT_RADIUS)
      .attr("fill", VolcanoComponent.COLOR_UNSELECTED)
      .attr("stroke", "none")
      .attr("opacity", VolcanoComponent.OPACITY)
      .on("mouseover", (d) => this.onPointMouseOver(d3.event, d))
      .on("mouseout", (d) => this.onPointMouseOut(d3.event, d))
      .on("click", (d) => this.onPointClick(d3.event, d));

    // Add x-axis label
    svg
      .append("text")
      .attr("class", "x-axis-label")
      .attr("x", VolcanoComponent.WIDTH / 2)
      .attr("y", VolcanoComponent.HEIGHT + VolcanoComponent.MARGIN.bottom)
      .attr("text-anchor", "middle")
      .text(`Log2 Fold Change`)


    // Add y-axis label
    svg
      .append("text")
      .attr("class", "y-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -VolcanoComponent.HEIGHT / 2)
      .attr("y", -VolcanoComponent.MARGIN.left)
      .attr("text-anchor", "middle")
      .text("-log10(p-adjusted)")

    // Add x-axis spine
    svg
      .append("line")
      .attr("class", "x-axis-spine")
      .attr("x1", 0)
      .attr("y1", VolcanoComponent.HEIGHT)
      .attr("x2", VolcanoComponent.WIDTH)
      .attr("y2", VolcanoComponent.HEIGHT)
      .attr("stroke", "black")
      .attr("stroke-width", 1);

    // Add y-axis spine
    svg
      .append("line")
      .attr("class", "y-axis-spine")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", VolcanoComponent.HEIGHT)
      .attr("stroke", "black")
      .attr("stroke-width", 1);

    // Add a title
    svg
      .append("text")
      .attr("class", "title")
      .attr("x", VolcanoComponent.WIDTH / 2)
      .attr("y", -VolcanoComponent.MARGIN.top)
      .attr("text-anchor", "middle")
      .text("Differential Expression Volcano Plot")
      .style("font-size", "20px")
      .style("font-weight", "bold")

    // Add x-axis ticks
    const xAxis = d3.axisBottom(this.xScale);
    svg
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${VolcanoComponent.HEIGHT})`)
      .call(xAxis as any);

    // Add y-axis ticks
    const yAxis = d3.axisLeft(this.yScale);
    svg
      .append("g")
      .attr("class", "y-axis")
      .call(yAxis as any);

    // Add event listeners to the whole chart for selection
    d3.select(`#${this.svgId}`)
      .on("mousedown", this.onMouseDown.bind(this))
      .on("mousemove", this.onMouseMove.bind(this))
      .on("mouseup", this.onMouseUp.bind(this));



    this.selectByStats(this.selectByStatsForm.nlogpadj, this.selectByStatsForm.log2FoldChange)
    this.emitSelectionUpdate();
  }

  ngOnInit(): void {
    // listen for window size changes
    window.addEventListener("resize", () => {
      VolcanoComponent.WIDTH = Number(window.getComputedStyle(document.body).width.replace('px', '')) / 2
      VolcanoComponent.HEIGHT = Number(window.getComputedStyle(document.body).height.replace('px', '')) / 1.5
      this.ngAfterViewInit();
  })
}


  constructor(private cd: ChangeDetectorRef) {}
}
