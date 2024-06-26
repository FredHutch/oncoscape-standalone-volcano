import { EnrichrGSEAResults, EnrichrPathwaysBackground } from "./../../service/enrichment-analysis/enrichment-analysis.service.types"
import {
ChangeDetectionStrategy,
  Component,
  Input,
  AfterViewInit,
  OnInit,
  Output,
  EventEmitter,
  ViewChild,
} from "@angular/core";
import {
  EnrichmentAnalysisService,
} from "app/service/enrichment-analysis/enrichment-analysis.service";
import * as d3 from "d3";
import { Observable } from "rxjs";
import { IVolcanoSelection, VolcanoPoint } from "../volcano/volcano.component.types";
import { MatSelectChange } from "@angular/material";
import { VolcanoLayoutManagerService } from 'app/service/volcano-layout-manager.service';
import { DownloadPlotFileType } from 'app/service/plot-download.service';
import { DownloadPlotComponent } from '../download-plot/download-plot.component';
import { FormControl, FormGroup } from '@angular/forms';

export type EnrichmentAnalysisVizOptions = {

  /** Parameters passed to the API, and parameters that affectsthe data before it goes into the API. */
  api: APIOptions;

  /** Parameters that affect the preprocessing of the data after the API, before d3 */
  preprocessing: PreprocessingOptions;

  /** Parameters that affect d3 */
  plotting: PlottingOptions;

  /** Parameters passed pack to the volcano chart on hover/click events */
  volcano: VolcanoOptions;
};

type PreprocessingOptions = {
  /** Whether to include unmapped reference genes in the bgRatio calculation */
  includeUnmappedReferenceGenes: boolean;
  /** Whether to include unmapped input list genes in the geneRatio calculation */
  includeUnmappedInputListGenes: boolean;
};

type PlottingOptions = {
  x: XAxisOptions;
  sortBy: string;
  sortDirection: "asc" | "desc";
  colorBy: ColorByOptions;
  sizeBy: SizeByOptions;
  /** The number of top n terms to show */
  n: number;
  useIdsForTermLabels?: boolean;
};

type APIOptions = {
  backgroundDataset: typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"][number]["value"];
  regulation: 'up' | 'down';
}

type VolcanoOptions = {
  numGenesToLabel: number;
}

enum ColorByOptions {
  FDR = "fdr",
  adjPValue = "adjPValue",
  FoldEnrichment = "fold_enrichment",
}

enum SizeByOptions {
  NumberInList = "number_in_list",
  NumberInReference = "number_in_reference",
}

enum XAxisOptions {
  GeneRatio = "geneRatio",
  BgRatio = "bgRatio",
  // adjPValue = "adjPValue",
}

enum SortByOptions {
  GeneRatio = "geneRatio",
  BgRatio = "bgRatio",
  // adjPValue = "adjPValue",
  FoldEnrichment = "fold_enrichment",
}

export type EAPlotPoint = (EnrichrGSEAResults[number] & {
  // bgRatio: number;
  geneRatio: number;
  termId: string;
  termLabel: string;
  number_in_list: number;
});

@Component({
  selector: "app-enrichment-analysis",
  templateUrl: "./enrichment-analysis.component.html",
  styleUrls: ["./enrichment-analysis.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentAnalysisComponent implements AfterViewInit, OnInit {
  static DEFAULT_RENDER_OPTIONS: EnrichmentAnalysisVizOptions = {
    preprocessing: {
      includeUnmappedInputListGenes: false,
      includeUnmappedReferenceGenes: false,
    },
    plotting: {
      x: XAxisOptions.GeneRatio,
      sortBy: SortByOptions.GeneRatio,
      sortDirection: "desc",
      colorBy: ColorByOptions.adjPValue,
      sizeBy: SizeByOptions.NumberInList,
      n: 20,
      useIdsForTermLabels: false,
    },
    api: {
      backgroundDataset: EnrichrPathwaysBackground.REACTOME_2022,
      regulation: 'up'
    },
    volcano: {
      numGenesToLabel: 20
    }
  };

  static MARGIN = { top: 40, right: 40, bottom: 100, left: 20 };
  static LEGEND_WIDTH = 100;
  static LEGEND_PADDING = 10;

  public loading = false;
  public loadingBackgroundDatasetMapping = false;

  public regulationForm = new FormGroup({
    regulation: new FormControl(EnrichmentAnalysisComponent.DEFAULT_RENDER_OPTIONS.api.regulation)
  });

  public downloadPlotType: DownloadPlotFileType = DownloadPlotFileType.SVG;

  public get useIdsForTermLabels(): boolean {
    return this.options.plotting.useIdsForTermLabels;
  }

  public set useIdsForTermLabels(value: boolean) {
    this.options.plotting.useIdsForTermLabels = value;
    this.render();
  }

  public get numGenesToLabel(): number {
    return this.options.volcano.numGenesToLabel;
  }
  public set numGenesToLabel(value: number) {
    this.options.volcano.numGenesToLabel = value;
    if (this.clickedPoint) {
      // update the volcano plot with a mouseclick
      this.onmouseclick.emit({
        point: this.clickedPoint,
        options: this.options.volcano
      });
    }
  }


  get colorByOptions(): string[] {
    // since we cant use Object.values
    return Object.keys(ColorByOptions).map((key) => ColorByOptions[key]);
  }

  get sizeByOptions(): string[] {
    return Object.keys(SizeByOptions).map((key) => SizeByOptions[key]);
  }

  get xAxisOptions(): string[] {
    return Object.keys(XAxisOptions).map((key) => XAxisOptions[key]);
  }

  get sortByOptions(): string[] {
    return Object.keys(SortByOptions).map((key) => SortByOptions[key]);
  }

  get currentBackgroundDataset(): typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"][number]["value"] {
    return this.options.api.backgroundDataset;
  }
  set currentBackgroundDataset(dataset: typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"][number]["value"]) {
    this.setBackgroundDataset(dataset);
  }

  get availableBackgrounds(): typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"] {
    return EnrichmentAnalysisService.AVAILABLE_BACKGROUNDS;
  }

  @ViewChild(DownloadPlotComponent, {static: false})
  downloadPlotComponent: DownloadPlotComponent;

  @Input() id: string;
  @Input() downregulatedColor: string;
  @Input() upregulatedColor: string;
  @Input() getGeneRegulation: (point: VolcanoPoint) => 'up' | 'down' | 'none';
  @Input() selectionObservable: Observable<IVolcanoSelection>;

  private _genes: string[] = [];
  get genes(): string[] {
    return this._genes;
  }
  private _downregulatedGenes: string[] = [];
  private _upregulatedGenes: string[] = [];
  get downregulatedGenes(): string[] {
    return this._downregulatedGenes;
  }
  get upregulatedGenes(): string[] {
    return this._upregulatedGenes;
  }



  // We have this active flag so we don't render hit the API endpoint when the viz is not open.
  private _active: boolean = false;
  @Input() set active(value: boolean) {
    this._active = value;
    if (this._active && this._genes.length > 0) {
      this.runEnrichrGSEA();
    }
  }

  @Output() onmouseover: EventEmitter<{
    point: EAPlotPoint,
    options: VolcanoOptions
  }> = new EventEmitter();
  @Output() onmouseout: EventEmitter<void> = new EventEmitter();
  @Output() onmouseclick: EventEmitter<{
    point: EAPlotPoint,
    options: VolcanoOptions
  } | null> = new EventEmitter();

  private options: EnrichmentAnalysisVizOptions =
    EnrichmentAnalysisComponent.DEFAULT_RENDER_OPTIONS;

  /** key is userListId_dataset */
  private data: EnrichrGSEAResults;
  private plot: d3.Selection<SVGGElement, unknown, HTMLElement, any>;

  private clickedPoint: EAPlotPoint | null = null;

  private xScale: d3.ScaleLinear<any, any>;
  private yScale: d3.ScaleBand<string>;
  private colorScale: d3.ScaleSequential<string, never>;
  private circles: d3.Selection<
    SVGCircleElement,
    EAPlotPoint,
    SVGGElement,
    unknown
  >;

  static preprocessData(
    data: EnrichrGSEAResults,
    inputList: string[],
    // TODO: implement bgRatio with the background list API endpoint that Enrichr provides
    // referenceList: string[],
    options: PreprocessingOptions
  ): (EnrichrGSEAResults[number] & {
    // bgRatio: number;
    geneRatio: number;
    termId: string;
    termLabel: string;
    number_in_list: number;
  })[] {

    const resultWithRatios = data.map((d) => {
      return {
        ...d,
        geneRatio: d.overlappingGenes.length / inputList.length,
        // TODO: implement bgRatio with the background list API endpoint that Enrichr provides
        // bgRatio: d.number_in_reference / totalGenesInReferenceSet,
        number_in_list: d.overlappingGenes.length,
      };
    });

    const resultWithTermInfo = resultWithRatios.map((r) => {
      return {
        ...r,
        termId: r.term,
        termLabel: r.term
      };
    });

    return resultWithTermInfo;
  }

  private exitSelection() {
    this.clickedPoint = null;
    this.removeTooltip();
    // set all circles to default color and no stroke
    this.circles.style("fill", (d) => this.colorScale(d[this.options.plotting.colorBy]))
      .style("stroke", "none")
      .style("stroke-width", 0);
  }

  private runEnrichrGSEA() {
    console.log("running enrichr gsea with options", this.options.api)
    this.loading = true;
    this.removeSVG();

    const regulation = this.options.api.regulation;
    const backgroundDataset = this.options.api.backgroundDataset;
    const regulatedGenes = regulation === 'up' ? this._upregulatedGenes : this._downregulatedGenes;


    this.ea
      .runEnrichrGSEA(regulatedGenes, backgroundDataset, regulation).then((observable) => {
        observable.subscribe((res) => {

          if (res === undefined) {
            return;
          }

          this.loading = false;
          this.data = res;
          this.render();
        });
      })

  }

  public downloadPlot(downloadPlotType: DownloadPlotFileType = null): void {
    this.downloadPlotComponent.download(downloadPlotType);
  }

  /**
   * @description Set the annotation dataset to use for the visualization. Will trigger an API call and a rerender.
   * @param datasetId ID of the annotation dataset to use (GO:xxxxxxx)
   */
  public setBackgroundDataset(dataset: typeof EnrichmentAnalysisService["AVAILABLE_BACKGROUNDS"][number]["value"]) {
    this.options.api.backgroundDataset = dataset;
    this.ea.loadBackgroundDatasetMapping(dataset).then(() => {
      this.loadingBackgroundDatasetMapping = false;
    });

    if (!this._active) return;

    this.runEnrichrGSEA();
  }

  public updatePlottingOption(event: MatSelectChange) {
    const option = event.source.id;
    this.options.plotting[option] = event.value;
    this.render();
  }

  async render(options: EnrichmentAnalysisVizOptions = this.options): Promise<void> {

    // if the tab is not active or the data is not loaded, don't render
    if (this.data === undefined) return;
    if (!this._active) return;


    // Calculate the available width and height for the plot
    const availableWidth = Number(
      window
        .getComputedStyle(document.getElementById("tabs-container"))
        .width.replace("px", "")
    );
    const availableHeight = this.layout.getAvailableHeightForActiveTab();

    // Set up the SVG container dimensions
    const width =
      availableWidth -
      EnrichmentAnalysisComponent.MARGIN.left -
      EnrichmentAnalysisComponent.MARGIN.right -
      EnrichmentAnalysisComponent.LEGEND_WIDTH -
      EnrichmentAnalysisComponent.LEGEND_PADDING;
    const height =
      availableHeight -
      EnrichmentAnalysisComponent.MARGIN.top -
      EnrichmentAnalysisComponent.MARGIN.bottom;

    // preprocess the data and apply sorting and top n limits
    const data = EnrichmentAnalysisComponent.preprocessData(
      this.data,
      this.genes,
      options.preprocessing
    )
      .sort((a, b) => {
        return (
          (a[options.plotting.sortBy] - b[options.plotting.sortBy]) *
          (options.plotting.sortDirection === "asc" ? 1 : -1)
        );
      })
      .slice(0, options.plotting.n);

    // clean up from previous render
    this.removeSVG();
    this.clickedPoint = null;


    // Create the SVG container
    const svg = d3
      .select(`#ea-svg-container`)
      .append("svg")
      .attr("id", "ea-svg")
      .attr(
        "width",
        EnrichmentAnalysisComponent.MARGIN.left +
          width +
          EnrichmentAnalysisComponent.LEGEND_PADDING +
          EnrichmentAnalysisComponent.LEGEND_WIDTH +
          EnrichmentAnalysisComponent.MARGIN.right
      )
      .attr(
        "height",
        height +
          EnrichmentAnalysisComponent.MARGIN.top +
          EnrichmentAnalysisComponent.MARGIN.bottom
      );

    // @ts-ignore
    this.plot = svg
      .append("g")
      .attr("id", "ea-plot")
      .attr(
        "transform",
        "translate(" +
          EnrichmentAnalysisComponent.MARGIN.left +
          "," +
          EnrichmentAnalysisComponent.MARGIN.top +
          ")"
      );

    const legend = svg
      .append("g")
      .attr("id", "ea-legend")
      .attr(
        "transform",
        "translate(" +
          (EnrichmentAnalysisComponent.MARGIN.left +
            width +
            EnrichmentAnalysisComponent.LEGEND_PADDING) +
          "," +
          EnrichmentAnalysisComponent.MARGIN.top +
          ")"
      );

    // Create x and y scales
    this.xScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d[options.plotting.x])])
      .range([0, width - EnrichmentAnalysisComponent.LEGEND_WIDTH]);

    this.yScale = d3
      .scaleBand()
      .domain(data.map((d) => d.termId))
      .range([0, height])
      .padding(0.1);

    // Define color scale based on fdr values
    this.colorScale = d3
      .scaleSequential()
      .domain([0, d3.max(data, (d) => d[options.plotting.colorBy])])
      .interpolator(d3.interpolateRgb("purple", "red")); // Adjust the color scale as needed

    // Create x and y axes

    const yAxis = d3.axisLeft(this.yScale).tickFormat((d, i) => {
      return data[i].termLabel.slice(0, 30) + (data[i].termLabel.length > 30 ? "..." : "");
    });

    // trick to make sure that the potentially very long y axis ticks are always visible
    // https://stackoverflow.com/a/21604029
    var maxTermWidth = 0;
    this.plot
      .selectAll("text.foo")
      .data(
        data.map((d, i) =>
          data[i].termId.slice(0, 30) + (data[i].termId.length > 30 ? "..." : "")
        )
      )
      .enter()
      .append("text")
      .text((d) => d)
      .each(function (d) {
        maxTermWidth = Math.max(
          //@ts-ignore
          this.getBBox().width + yAxis.tickSize() + yAxis.tickPadding(),
          maxTermWidth
        );
      })
      .remove();
    this.plot.attr(
      "transform",
      "translate(" +
        Math.abs(maxTermWidth) +
        "," +
        EnrichmentAnalysisComponent.MARGIN.top +
        ")"
    );

    // update the range of the x axis
    this.xScale.range([
      0,
      width + EnrichmentAnalysisComponent.MARGIN.left - Math.abs(maxTermWidth),
    ]);
    const xAxis = d3.axisBottom(this.xScale);

    // Append x axis
    this.plot
      .append("g")
      .attr("transform", "translate(0," + height + ")")
      //@ts-ignore
      .call(xAxis);

    // Append y axis
    //@ts-ignore
    this.plot
    .append("g")
    .attr("class", "y axis")
    // @ts-ignore
    .call(yAxis);

    this.plot.selectAll('.y.axis>.tick') // gs for all ticks
      .append('title') // append title with text
      .text((d, i) => data[i].termLabel); // set text to the term label

    // Add circles for dot plot
    const sizeScale = d3
      .scaleLinear()
      .domain(d3.extent(data.map((d) => d[options.plotting.sizeBy])))
      .range([3, 10]);

    const self = this;

    //@ts-ignore
    this.circles = this.plot
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", (d) => this.xScale(d[options.plotting.x]))
      .attr("cy", (d) => this.yScale(d.termId) + this.yScale.bandwidth() / 2)
      .attr("r", (d) => sizeScale(d[options.plotting.sizeBy]))
      .attr("fill", (d) => this.colorScale(d[options.plotting.colorBy]))
      .style("stroke", "none")
      .style("stroke-width", 0);

    this.circles
      .on("mouseover", function (event, _d) {

        self.showTooltip(event, options.plotting);

        // disable onmouseover if any point was clicked
        if (self.clickedPoint) return;

        const d: EAPlotPoint = _d as any;



        d3.select(this)
          .attr(
            "fill",
            self.darkenColor(self.colorScale(d[options.plotting.colorBy]))
          ).style(
            "stroke", "black"
          )
          .style(
            "stroke-width", 5
          );

        // select all other circles and remove their stroke
        self.circles
          .filter((c) => c.termId !== d.termId)
          .style("stroke", "none")
          .style("stroke-width", 0)

        self.loadingBackgroundDatasetMapping = true;
        self.onmouseover.emit({
          point: d,
          options: self.options.volcano
        });
      })
      // @ts-ignore
      .on("click", function(event, _d: EAPlotPoint) {

        // ignore click events if a point is already clicked
        if (self.clickedPoint === _d) return;
        // if a different point is currently clicked, then exit the selection and emit a null click event (as if empty space was clicked)
        if (self.clickedPoint && self.clickedPoint !== _d) {
          self.exitSelection();
          self.onmouseclick.emit(null);
          return
        }

        // lighten all other circles
        self.circles
          .filter((d) => d.termId !== _d.termId)
          .attr("fill", (d) => self.makeColorPale(self.colorScale(d[options.plotting.colorBy])))


        self.onmouseclick.emit({
          point: _d as EAPlotPoint,
          options: self.options.volcano
        });
        self.clickedPoint = _d;
        self.showTooltip(event, options.plotting);
      })
      .on("mouseout", function (event, d) {
        self.removeTooltip();

        // dont emit onmouseout if the point was clicked
        if (!self.clickedPoint) {
          self.onmouseout.emit();
        }

      });

    // Adding x-axis label
    this.plot
      .append("text")
      .attr(
        "transform",
        "translate(" +
          this.xScale.range()[1] / 2 +
          " ," +
          (height + EnrichmentAnalysisComponent.MARGIN.top + 20) +
          ")"
      )
      .style("text-anchor", "middle")
      .text(options.plotting.x);

    //@ts-ignore
    this.drawLegend(legend, data, options, this.colorScale, sizeScale);

    svg.on("click", (event) => {

      // @ts-ignore
      if (event.target.tagName === "circle") return;

      this.exitSelection();
      this.onmouseclick.emit(null);
      this.clickedPoint = null;
    });
  }

  plotReady(): boolean {
    return !this.loadingBackgroundDatasetMapping &&
    this.genes.length > 0 &&
    !this.loading
  }

  private showTooltip(event: any, options: PlottingOptions) {
    const d: EAPlotPoint = event.srcElement.__data__;

    d3
      .select(`body`)
      .append("div")
      .attr("class", "ea-tooltip xtooltiptext")
      .attr("name", d.termId)
      .style("position", "absolute")
      // the differential-expression-panel has a z-index of 100 since it is an overlay
      .style("z-index", "1000")
      .style("left", event.pageX + 15 + "px")
      .style("top", event.pageY - 20 + "px")
      .style("font-size", "12px").html(`
        <div><b>${d.termLabel}</b></div>
        <div>${options.x}: ${d[options.x]}</div>
        <div>${options.sizeBy}: ${d[options.sizeBy]}</div>
        <div>${options.colorBy}: ${d[options.colorBy]}</div>
      `);
  }

  private removeTooltip() {
    d3.selectAll(".ea-tooltip").remove();
  }

  /** Helper function to darken a color by a given factor. */
  private darkenColor(color: string, factor = 0.8): string {
    // Convert color to RGB format
    const rgbColor = d3.rgb(color);

    // Darken the color by reducing its brightness
    const darkenedColor = d3.rgb(
      rgbColor.r * factor,
      rgbColor.g * factor,
      rgbColor.b * factor
    );

    return darkenedColor.toString();
  }

  private makeColorPale(color: string, factor = 0.5): string {
    const rgbColor = d3.rgb(color);
    const paleColor = d3.rgb(
      rgbColor.r + (255 - rgbColor.r) * factor,
      rgbColor.g + (255 - rgbColor.g) * factor,
      rgbColor.b + (255 - rgbColor.b) * factor
    );

    return paleColor.toString();
  }

  private drawLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: EAPlotPoint[],
    options: EnrichmentAnalysisVizOptions,
    colorScale: d3.ScaleSequential<string, never>,
    sizeScale: d3.ScaleLinear<number, number, never>
  ) {
    const PADDING_BETWEEN_LEGEND_ITEMS = 35;

    const colorLegendHeight = this.drawColorLegend(
      legend,
      data,
      options,
      colorScale
    );
    this.drawSizeLegend(
      legend,
      data,
      options,
      sizeScale,
      colorLegendHeight + PADDING_BETWEEN_LEGEND_ITEMS
    );
  }

  private drawSizeLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: EAPlotPoint[],
    options: EnrichmentAnalysisVizOptions,
    sizeScale: d3.ScaleLinear<number, number, never>,
    heightOffset: number
  ) {
    const domain = sizeScale.domain(); // raw data
    const range = sizeScale.range(); // [3,10]

    // Define the size legend height and width
    const CIRCLE_PADDING = 15;
    const TITLE_PADDING = 20;

    const legendSizeValues = [
      { domain: domain[0], range: sizeScale(domain[0]) },
      {
        domain: Math.floor((domain[0] + domain[1]) / 2),
        range: sizeScale((domain[0] + domain[1]) / 2),
      },
      { domain: domain[1], range: sizeScale(domain[1]) },
    ];

    const g = legend
      .append("g")
      .attr(
        "transform",
        `translate(${
          EnrichmentAnalysisComponent.LEGEND_WIDTH * 0.75
        }, ${heightOffset})`
      );

    g.append("text")
      .attr("text-anchor", "middle")
      .text(options.plotting.sizeBy);

    g.selectAll("circle")
      .data(legendSizeValues)
      .enter()
      .append("circle")
      .attr("fill", "black")
      .attr("cy", (d, i) => (range[1] + CIRCLE_PADDING) * i + TITLE_PADDING)
      .attr("r", (d) => d.range);

    g.selectAll(".sizeby-legend-text")
      .data(legendSizeValues)
      .enter()
      .append("text")
      .attr("fill", "black")
      .attr("x", range[1] + CIRCLE_PADDING)
      .attr("y", (d, i) => {
        return (range[1] + CIRCLE_PADDING) * i + TITLE_PADDING;
      })
      .attr("alignment-baseline", "middle")
      .text((d) => {
        return d.domain;
      });
  }

  private drawColorLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: EAPlotPoint[],
    options: EnrichmentAnalysisVizOptions,
    colorScale: d3.ScaleSequential<string, never>
  ): number {
    const dataColorExtent: [number, number] = d3.extent(
      data.map((d) => d[options.plotting.colorBy])
    );

    // Define the color legend height and width
    const COLOR_LEGEND_HEIGHT = 100;
    const COLOR_LEGEND_WIDTH = 20;

    // Define the legend color scale
    const legendColorScale = d3
      .scaleLinear()
      .domain(colorScale.domain())
      .range([0, COLOR_LEGEND_HEIGHT]);

    // Define color legend values with more granularity for smoother gradient
    const legendColorValues = d3.range(0, COLOR_LEGEND_HEIGHT + 1, 1);

    // Create color legend axis
    const legendAxis = d3.axisRight(legendColorScale).ticks(5);

    const g = legend
      .append("g")
      .attr(
        "transform",
        "translate(" +
          EnrichmentAnalysisComponent.LEGEND_WIDTH * 0.75 +
          "," +
          0 +
          ")"
      );

    // Add color gradient to the legend
    g.append("defs")
      .append("linearGradient")
      .attr("id", "colorLegendGradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", COLOR_LEGEND_HEIGHT)
      .selectAll("stop")
      .data(legendColorValues)
      .enter()
      .append("stop")
      .attr("offset", (d) => (d / COLOR_LEGEND_HEIGHT) * 100 + "%")
      .attr("stop-color", (d) =>
        colorScale(
          (d / COLOR_LEGEND_HEIGHT) *
            (dataColorExtent[1] - dataColorExtent[0]) +
            dataColorExtent[0]
        )
      );

    g.append("text")
      .attr("text-anchor", "middle")
      .text(options.plotting.colorBy);

    // Append the color legend rectangle
    g.append("rect")
      .attr("width", COLOR_LEGEND_WIDTH)
      .attr("height", COLOR_LEGEND_HEIGHT)
      .attr(
        "transform",
        "translate(" + -COLOR_LEGEND_WIDTH / 2 + " ," + 10 + ")"
      )
      .style("fill", "url(#colorLegendGradient)");

    // Append the color legend axis
    g.append("g")
      .attr("transform", "translate(" + COLOR_LEGEND_WIDTH / 2 + ", 10)")
      //@ts-ignore
      .call(legendAxis);

    return COLOR_LEGEND_HEIGHT;
  }

  private removeSVG() {
    d3.select(`#ea-svg-container`).selectAll("svg").remove();
    // tooltip is on the body, not the svg, so we need to remove it manually
    this.removeTooltip();
  }

  ngAfterViewInit(): void {
    this.setBackgroundDataset(EnrichrPathwaysBackground.REACTOME_2022)
    this.layout.panelStates$.subscribe((panelStates) => {
      this.render();
    });

    window.addEventListener("resize", () => this.render.bind(this));

    this.selectionObservable.subscribe((selection) => {
      this._genes = selection.selectedPoints.map((p) => p.gene);
      if (this._genes === undefined || this._genes.length === 0) {
        this.removeSVG();
        this.loading = false;
        return;
      }
      this._upregulatedGenes = selection.selectedPoints.filter((p) => this.getGeneRegulation(p) === 'up').map((p) => p.gene);
      this._downregulatedGenes = selection.selectedPoints.filter((p) => this.getGeneRegulation(p) === 'down').map((p) => p.gene);
      if (this.upregulatedGenes.length === 0 && this.downregulatedGenes.length === 0) {
        this.removeSVG();
        this.loading = false;
        return;
      }

      // try to set regulation by default to up whenever the data changes, unless there are only downregulated genes
      if (this.upregulatedGenes.length > 0) {
        this.options.api.regulation = 'up';
      } else {
        this.options.api.regulation = 'down';
      }

      // if genes update but the EA tab is not active, don't run the analysis
      if (!this._active) {
        return;
      }

      this.runEnrichrGSEA();
    });
  }

  ngOnInit(): void {
    this.regulationForm.valueChanges.subscribe((value) => {
      this.options.api.regulation = value.regulation;
      this.runEnrichrGSEA();
    });
  }

  constructor(public ea: EnrichmentAnalysisService, private layout: VolcanoLayoutManagerService) {}
}
