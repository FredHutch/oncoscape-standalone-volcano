import { EnrichrBackgroundType, EnrichrGSEAResults, EnrichrPathwaysBackground } from './../../service/enrichment-analysis/enrichment-analysis.service.types';
import { HttpClient } from "@angular/common/http";
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
import { IVolcanoSelection } from "../volcano/volcano.component.types";
import { MatSelectChange } from "@angular/material";
import { VolcanoLayoutManagerService } from 'app/service/volcano-layout-manager.service';
import { DownloadPlotFileType } from 'app/service/plot-download.service';
import { DownloadPlotComponent } from '../download-plot/download-plot.component';

type EnrichmentAnalysisVizOptions = {
  preprocessing: PreprocessingOptions;
  plotting: PlottingOptions;
  api: APIOptions;
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
}

enum ColorByOptions {
  FDR = "fdr",
  PValue = "pValue",
  FoldEnrichment = "fold_enrichment",
}

enum SizeByOptions {
  NumberInList = "number_in_list",
  NumberInReference = "number_in_reference",
}

enum XAxisOptions {
  GeneRatio = "geneRatio",
  BgRatio = "bgRatio",
  // PValue = "pValue",
}

enum SortByOptions {
  GeneRatio = "geneRatio",
  BgRatio = "bgRatio",
  // PValue = "pValue",
  FoldEnrichment = "fold_enrichment",
}

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
      colorBy: ColorByOptions.PValue,
      sizeBy: SizeByOptions.NumberInList,
      n: 20,
      useIdsForTermLabels: false,
    },
    api: {
      backgroundDataset: EnrichrPathwaysBackground.REACTOME_2022,
    }
  };

  static MARGIN = { top: 40, right: 40, bottom: 100, left: 20 };
  static LEGEND_WIDTH = 100;
  static LEGEND_PADDING = 10;

  public loading = false;
  public loadingBackgroundDatasetMapping = false;

  public downloadPlotType: DownloadPlotFileType = DownloadPlotFileType.SVG;

  private options: EnrichmentAnalysisVizOptions =
    EnrichmentAnalysisComponent.DEFAULT_RENDER_OPTIONS;

  public get useIdsForTermLabels(): boolean {
    return this.options.plotting.useIdsForTermLabels;
  }

  public set useIdsForTermLabels(value: boolean) {
    this.options.plotting.useIdsForTermLabels = value;
    this.render();
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

  private _genes: string[] = [];
  get genes(): string[] {
    return this._genes;
  }
  @Input() selectionObservable: Observable<IVolcanoSelection>;

  // We have this active flag so we don't render hit the API endpoint when the viz is not open.
  private _active: boolean = false;
  @Input() set active(value: boolean) {
    this._active = value;
    if (this._active && this._genes.length > 0) {
      this.runEnrichrGSEA();
    }
  }

  @Output() onmouseover: EventEmitter<string> = new EventEmitter();
  @Output() onmouseout: EventEmitter<void> = new EventEmitter();

  /** key is userListId_dataset */
  private data: EnrichrGSEAResults;
  private plot: d3.Selection<SVGGElement, unknown, HTMLElement, any>;

  private xScale: d3.ScaleLinear<any, any>;
  private yScale: d3.ScaleBand<string>;
  private circles: d3.Selection<
    SVGCircleElement,
    ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>[number],
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

  private runEnrichrGSEA() {
    // dont let lastSelectedTerm persist between runs
    console.log("running enrichr gsea")
    this.lastSelectedTerm = undefined;
    this.loading = true;
    this.removeSVG();
    this.ea
      .runEnrichrGSEA(this._genes, this.options.api.backgroundDataset).then((observable) => {
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

    this.removeSVG();


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
    const colorScale = d3
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
      .attr("fill", (d) => colorScale(d[options.plotting.colorBy]))
      .style("stroke", "none")
      .style("stroke-width", 0);

    this.circles
      .on("mouseover", function (event, d) {

        self.showTooltip(event, options.plotting);

        d3.select(this)
          .attr(
            "fill",
            self.darkenColor(colorScale(d[options.plotting.colorBy]))
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
        self.onmouseover.emit(d.termId);
      })
      .on("mouseout", function (event, d) {
        self.removeTooltip();
        self.onmouseout.emit();
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
    this.drawLegend(legend, data, options, colorScale, sizeScale);
  }

  plotReady(): boolean {
    return !this.loadingBackgroundDatasetMapping &&
    this.genes.length > 0 &&
    !this.loading
  }

  private showTooltip(event: any, options: PlottingOptions) {
    const d: ReturnType<
      typeof EnrichmentAnalysisComponent.preprocessData
    >[number] = event.srcElement.__data__;

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
        <div><b>${d.termLabel}</b> (${d.termId})</div>
        <div>${options.x}: ${d[options.x]}</div>
        <div>${options.sizeBy}: ${d[options.sizeBy]}</div>
        <div>${options.colorBy}: ${d[options.colorBy]}</div>
      `);
  }

  private removeTooltip() {
    d3.select(".ea-tooltip").remove();
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

  private drawLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
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
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
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
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
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

      // if genes update but the EA tab is not active, don't run the analysis
      if (!this._active) {
        return;
      }

      this.runEnrichrGSEA();
    });
  }

  ngOnInit(): void {}

  constructor(public ea: EnrichmentAnalysisService, private layout: VolcanoLayoutManagerService) {}
}
