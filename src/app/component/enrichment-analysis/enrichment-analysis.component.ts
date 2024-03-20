import { HttpClient } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  AfterViewInit,
} from "@angular/core";
import { EnrichmentAnalysisService, PANTHER_APIOptions } from "app/service/enrichment-analysis/enrichment-analysis.service";
import {
  PANTHER_Results,
  PANTHER_ResultItem,
} from "app/service/enrichment-analysis/enrichment-analysis.service.types";
import * as d3 from "d3";

type EnrichmentAnalysisVizOptions = {
  preprocessing: PreprocessingOptions;
  plotting: PlottingOptions;
  api: PANTHER_APIOptions;
};



type PreprocessingOptions = {
  /** Whether to include unmapped reference genes in the bgRatio calculation */
  includeUnmappedReferenceGenes: boolean;
  /** Whether to include unmapped input list genes in the geneRatio calculation */
  includeUnmappedInputListGenes: boolean;
};

type PlottingOptions = {
  x: string;
  y: string;
  sortBy: string;
  sortDirection: "asc" | "desc";
  colorBy: string;
  sizeBy: string;
  /** The number of top n terms to show */
  n: number;
};

@Component({
  selector: "app-enrichment-analysis",
  templateUrl: "./enrichment-analysis.component.html",
  styleUrls: ["./enrichment-analysis.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentAnalysisComponent implements AfterViewInit {
  static DEFAULT_RENDER_OPTIONS: EnrichmentAnalysisVizOptions = {
    preprocessing: {
      includeUnmappedInputListGenes: false,
      includeUnmappedReferenceGenes: false,
    },
    plotting: {
      x: "geneRatio",
      y: "termLabel",
      sortBy: "geneRatio",
      sortDirection: "desc",
      colorBy: "fdr",
      sizeBy: "number_in_list",
      n: 20,
    },
    api: EnrichmentAnalysisService.DEFAULT_PANTHER_APIOptions
  };

  static MARGIN = { top: 20, right: 40, bottom: 60, left: 20 };
  static LEGEND_WIDTH = 80;
  static LEGEND_PADDING = 10;

  public loading = false;

  private options: EnrichmentAnalysisVizOptions = EnrichmentAnalysisComponent.DEFAULT_RENDER_OPTIONS;


  get currentAnnDatasetId(): string {return this.options.api.annotationDatasetId}
  set currentAnnDatasetId(id: string) {
    this.setAnnotationDataset(id)
  }

  @Input() id: string;

  private _genes: string[] = [];
  get genes(): string[] {
    return this._genes;
  }
  @Input() set genes(value: string[]) {
    this._genes = value;
    if (value === undefined || value.length === 0) {
      this.removeSVG();
      return;
    }
    if (!this._active) {
      return;
    }
    this.runPANTHERAnalysis()
  }

  // We have this active flag so we don't render hit the API endpoint when the viz is not open.
  private _active: boolean = false;
  @Input() set active(value: boolean) {
    this._active = value;
    if (this._active && this._genes.length > 0) {
     this.runPANTHERAnalysis()
    }
  }

  private data: PANTHER_Results;
  private plot:  d3.Selection<SVGGElement, unknown, HTMLElement, any>;

  private xScale: d3.ScaleLinear<any, any>;
  private yScale: d3.ScaleBand<string>;
  private circles: d3.Selection<
    SVGCircleElement,
    ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>[number],
    SVGGElement,
    unknown
  >;

  static preprocessData(
    data: PANTHER_Results,
    options: PreprocessingOptions
  ): (PANTHER_ResultItem & {
    bgRatio: number;
    geneRatio: number;
    termId: string;
    termLabel: string;
  })[] {
    let totalGenesInReferenceSet = data.reference.mapped_count;
    if (options.includeUnmappedReferenceGenes) {
      totalGenesInReferenceSet += data.reference.unmapped_count;
    }
    let totalGenesInInputList = data.input_list.mapped_count;
    if (options.includeUnmappedInputListGenes) {
      totalGenesInInputList += data.input_list.unmapped_count;
    }

    const resultWithRatios = data.result.map((d) => {
      return {
        ...d,
        geneRatio: d.number_in_list / totalGenesInInputList,
        bgRatio: d.number_in_reference / totalGenesInReferenceSet,
      };
    });

    const resultWithTermInfo = resultWithRatios.map((r) => {
      return {
        ...r,
        termId: r.term.id,
        termLabel: r.term.label,
      };
    });

    return resultWithTermInfo;
  }

  /**
   * @description run Enrichment (Overrepresenation) Analysis on a set of genes, followed by a rerender. Will use the current this.options.api options
   */
  private runPANTHERAnalysis() {
    this.loading = true;
    this.removeSVG();
    this.ea.runPANTHERAnalysis(this._genes, this.options.api).subscribe((res) => {
      this.loading = false;
      this.data = res;
      this.render();
    });
  }

  /**
   * @description Set the annotation dataset to use for the visualization. Will trigger an API call and a rerender.
   * @param datasetId ID of the annotation dataset to use (GO:xxxxxxx)
   */
  public setAnnotationDataset(datasetId: string) {

    if (this.ea.availableAnnotationDatasets === undefined) {
      return
    }

    const index = this.ea.availableAnnotationDatasets.findIndex(
      (d) => d.id === datasetId
    );
    if (index === -1) {
      throw new Error(
        `Could not find annotation dataset with id: ${datasetId}`
      );
    }
    this.options.api.annotationDatasetId = datasetId;
    this.runPANTHERAnalysis()
  }

  render(
    options: EnrichmentAnalysisVizOptions = this.options
  ) {

    if (this.data === undefined) {
      return
    }

    console.log("Rendering Enrichment analysis dotplot with options:", options);
    const availableWidth = Number(
      window
        .getComputedStyle(document.getElementById("side-bar-tabs"))
        .width.replace("px", "")
    );
    const availableHeight = this.calculateAvailableHeight();

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
      options.preprocessing
    )
      .sort((a, b) => {
        return (
          (a[options.plotting.sortBy] - b[options.plotting.sortBy]) *
          (options.plotting.sortDirection === "asc" ? 1 : -1)
        );
      })
      .slice(0, options.plotting.n);

    console.log("preprocessed EA data", data)

    this.removeSVG();

    // Create the SVG container
    const svg = d3
      .select(`#enrichment-dot-plot-${this.id}`)
      .append("svg")
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
      .domain(data.map((d) => d[options.plotting.y]))
      .range([0, height])
      .padding(0.1);

    // Define color scale based on fdr values
    const colorScale = d3
      .scaleSequential()
      .domain([0, d3.max(data, (d) => d[options.plotting.colorBy])])
      .interpolator(d3.interpolateRgb("purple", "red")); // Adjust the color scale as needed

    // Create x and y axes

    const yAxis = d3.axisLeft(this.yScale);

    // trick to make sure that the potentially very long y axis ticks are always visible
    // https://stackoverflow.com/a/21604029
    var maxTermWidth = 0;
    this.plot
      .selectAll("text.foo")
      .data(data.map((d) => d[options.plotting.y]))
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
        Math.abs(maxTermWidth - EnrichmentAnalysisComponent.MARGIN.left) +
        "," +
        EnrichmentAnalysisComponent.MARGIN.top +
        ")"
    );

    // update the range of the x axis
    this.xScale.range([
      0,
      width +
        EnrichmentAnalysisComponent.MARGIN.left -
        Math.abs(maxTermWidth - EnrichmentAnalysisComponent.MARGIN.left),
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
    this.plot.append("g").call(yAxis);

    // Add circles for dot plot
    const sizeScale = d3
      .scaleLinear()
      .domain(d3.extent(data.map((d) => d[options.plotting.sizeBy])))
      .range([3, 10]);

    const self = this

    //@ts-ignore
    this.circles = this.plot
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", (d) => this.xScale(d[options.plotting.x]))
      .attr(
        "cy",
        (d) => this.yScale(d[options.plotting.y]) + this.yScale.bandwidth() / 2
      )
      .attr("r", (d) => sizeScale(d[options.plotting.sizeBy]))
      .attr("fill", (d) => colorScale(d[options.plotting.colorBy]));

    this.circles
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", self.darkenColor(colorScale(d[options.plotting.colorBy])));
        self.showTooltip(event, options.plotting);
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("fill", colorScale(d[options.plotting.colorBy]));
        self.hideTooltip();
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

  private showTooltip(event: any, options: PlottingOptions) {
    console.log("showing tooltip for", event)
    const d: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>[number] = event.srcElement.__data__;

    d3.select(`body`)
      .append("div")
      .attr("class", "ea-tooltip xtooltiptext")
      .attr("name", d.termId)
      .style("position", "absolute")
      // the differential-expression-panel has a z-index of 100 since it is an overlay
      .style("z-index", "1000")
      .style("left", event.pageX + 15 + "px")
      .style("top", event.pageY - 20 + "px")
      .style("font-size", "12px")
      .html(`
        <div><b>${d.termLabel}</b> (${d.termId})</div>
        <div>${options.x}: ${d[options.x]}</div>
        <div>${options.y}: ${d[options.y]}</div>
        <div>${options.sizeBy}: ${d[options.sizeBy]}</div>
        <div>${options.colorBy}: ${d[options.colorBy]}</div>
      `);
  }

  private hideTooltip() {
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

    const PADDING_BETWEEN_LEGEND_ITEMS = 35

    const colorLegendHeight = this.drawColorLegend(legend, data, options, colorScale);
    this.drawSizeLegend(legend, data, options, sizeScale, colorLegendHeight + PADDING_BETWEEN_LEGEND_ITEMS)
  }

  private drawSizeLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
    options: EnrichmentAnalysisVizOptions,
    sizeScale: d3.ScaleLinear<number, number, never>,
    heightOffset: number
  ) {
    const domain = sizeScale.domain() // raw data
    const range = sizeScale.range() // [3,10]

    // Define the color legend height and width
    const SIZE_LEGEND_WIDTH = 35;
    const CIRCLE_PADDING = 15;
    const TITLE_PADDING = 20;

    const legendSizeValues = [
      {domain:  domain[0], range: sizeScale(domain[0])},
      {domain: Math.floor((domain[0] + domain[1]) / 2), range: sizeScale((domain[0] + domain[1]) / 2)},
      {domain: domain[1], range: sizeScale(domain[1])}
      ]

    const g =  legend.append("g").attr("transform", `translate(${SIZE_LEGEND_WIDTH}, ${heightOffset})`)

    g.append("text")
    // .attr("text-anchor", "middle")
    .text(options.plotting.sizeBy)

    g
    .selectAll("circle")
    .data(legendSizeValues)
    .enter()
    .append("circle")
    .attr("fill", "black")
    .attr("cy", (d, i) => ((range[1] + CIRCLE_PADDING) * i) + TITLE_PADDING)
    .attr("r", d => d.range)

    g
    .selectAll(".sizeby-legend-text")
    .data(legendSizeValues)
    .enter()
    .append("text")
    .attr("fill", "black")
    .attr("x", range[1] + CIRCLE_PADDING)
    .attr("y", (d, i) => {
      return ((range[1] + CIRCLE_PADDING) * i) + TITLE_PADDING
    })
    .attr("alignment-baseline", "middle")
    .text(d => {
      return d.domain
    })

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

    // Add color gradient to the legend
    legend
      .append("defs")
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

    legend
      .append("text")
      .attr(
        "transform",
        "translate(" +
          EnrichmentAnalysisComponent.LEGEND_WIDTH / 2 +
          " ," +
          0 +
          ")"
      )

      .text(options.plotting.colorBy);

    // Append the color legend rectangle
    legend
      .append("rect")
      .attr("width", COLOR_LEGEND_WIDTH)
      .attr("height", COLOR_LEGEND_HEIGHT)
      .attr(
        "transform",
        "translate(" +
          EnrichmentAnalysisComponent.LEGEND_WIDTH / 2 +
          " ," +
          10 +
          ")"
      )
      .style("fill", "url(#colorLegendGradient)");

    // Append the color legend axis
    legend
      .append("g")
      .attr(
        "transform",
        "translate(" +
          (EnrichmentAnalysisComponent.LEGEND_WIDTH / 2 + COLOR_LEGEND_WIDTH) +
          ", 10)"
      )
      //@ts-ignore
      .call(legendAxis);

    return COLOR_LEGEND_HEIGHT;
  }

  private removeSVG() {
    d3.select(`#enrichment-dot-plot-${this.id}`).selectAll("svg").remove();
  }

  private calculateAvailableHeight(): number {
    const idsToSubstract: string[] = ["enrichment-dot-plot-controls"];
    const classesToSubtract: string[] = ["mat-tab-labels"];
    return (
      Number(
        window
          .getComputedStyle(document.getElementById("side-bar-tabs"))
          .height.replace("px", "")
      ) -
      idsToSubstract.reduce((prev, curr) => {
        const temp = document.getElementById(curr);
        return temp
          ? Number(window.getComputedStyle(temp).height.replace("px", "")) +
              prev
          : 0 + prev;
      }, 0) -
      classesToSubtract.reduce((prev, curr) => {
        return (
          Number(
            window
              .getComputedStyle(document.getElementsByClassName(curr)[0])
              .height.replace("px", "")
          ) + prev
        );
      }, 0)
    );
  }

  ngAfterViewInit(): void {
    this.ea.getAvailableAnnotationDatasets().subscribe(datasets => {
      this.ea.availableAnnotationDatasets = datasets
      this.setAnnotationDataset(this.options.api.annotationDatasetId)
    })

    window.addEventListener("resize", this.render.bind(this));
  }

  constructor(
    public ea: EnrichmentAnalysisService,
    private http: HttpClient
  ) {}
}
