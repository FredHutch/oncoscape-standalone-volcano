import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  AfterViewInit,
} from "@angular/core";
import { EnrichmentAnalysisService } from "app/service/enrichment-analysis/enrichment-analysis.service";
import {
  PANTHER_Results,
  PANTHER_ResultItem,
} from "app/service/enrichment-analysis/enrichment-analysis.service.types";
import * as d3 from "d3";

type RenderOptions = {
  preprocessing: PreprocessingOptions;
  plotting: PlottingOptions;
};

type PreprocessingOptions = {
  /** Whether to include unmapped reference genes in the bgRatio calculation */
  includeUnmappedReferenceGenes: boolean;
  /** Whether to include unmapped input list genes in the geneRation calculation */
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
export class EnrichmentAnalysisComponent implements OnInit {
  static DEFAULT_RENDER_OPTIONS: RenderOptions = {
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
  };

  static MARGIN = { top: 20, right: 40, bottom: 60, left: 20 };
  static LEGEND_WIDTH = 50;
  static LEGEND_PADDING = 10;

  public loading = false;

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
    this.loading = true;
    this.ea.runPANTHERAnalysis(value, false).subscribe((res) => {
      this.loading = false;
      this.data = res;
      this.render();
    });
  }

  // We have this active flag so we don't render hit the API endpoint when the viz is not open.
  private _active: boolean = false;
  @Input() set active(value: boolean) {
    this._active = value;
    if (this._active && this._genes.length > 0) {
      this.loading = true;
      this.ea.runPANTHERAnalysis(this._genes, false).subscribe((res) => {
        this.loading = false;
        this.data = res;
        this.render();
      });
    }
  }

  private data: PANTHER_Results;

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
      totalGenesInInputList += data.reference.unmapped_count;
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

  render(
    options: RenderOptions = EnrichmentAnalysisComponent.DEFAULT_RENDER_OPTIONS
  ) {
    console.log("Rendering Enrichment analysis dotplot with options:", options);
    const availableWidth = Number(
      window
        .getComputedStyle(document.getElementById("side-bar-tabs"))
        .width.replace("px", "")
    );
    const availableHeight = this.calculateAvailableHeight();

    // Set up the SVG container dimensions

    const width = availableWidth -
    EnrichmentAnalysisComponent.MARGIN.left -
    EnrichmentAnalysisComponent.MARGIN.right -
    EnrichmentAnalysisComponent.LEGEND_WIDTH -
    EnrichmentAnalysisComponent.LEGEND_PADDING
    ;
    const height = availableHeight - EnrichmentAnalysisComponent.MARGIN.top - EnrichmentAnalysisComponent.MARGIN.bottom;

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
      .attr("height", height + EnrichmentAnalysisComponent.MARGIN.top + EnrichmentAnalysisComponent.MARGIN.bottom);

    const plot = svg
      .append("g")
      .attr("transform", "translate(" + EnrichmentAnalysisComponent.MARGIN.left + "," + EnrichmentAnalysisComponent.MARGIN.top + ")");

    const legend = svg
      .append("g")
      .attr(
        "transform",
        "translate(" +
          (
            EnrichmentAnalysisComponent.MARGIN.left +
            width +
            EnrichmentAnalysisComponent.LEGEND_PADDING) +
          "," +
          EnrichmentAnalysisComponent.MARGIN.top +
          ")"
      )

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
    plot
      .selectAll("text.foo")
      .data(data.map((d) => d[options.plotting.y]))
      .enter()
      .append("text")
      .text((d) => d)
      .each(function (d) {
        maxTermWidth = Math.max(
          this.getBBox().width + yAxis.tickSize() + yAxis.tickPadding(),
          maxTermWidth
        );
      })
      .remove();
    plot.attr(
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
      width + EnrichmentAnalysisComponent.MARGIN.left - Math.abs(maxTermWidth - EnrichmentAnalysisComponent.MARGIN.left),
    ]);
    const xAxis = d3.axisBottom(this.xScale);

    // Append x axis
    plot
      .append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

    // Append y axis
    plot.append("g").call(yAxis);

    // Add circles for dot plot
    const sizeScale = d3.scaleLinear()
    .domain(d3.extent(data.map(d => d[options.plotting.sizeBy])))
    .range([3, 10])

    this.circles = plot
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

    // Adding x-axis label
    plot
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

    this.drawLegend(legend, data, options, colorScale)
  }

  private drawLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
    options: RenderOptions,
    colorScale: d3.ScaleSequential<string, never>
  ) {
    this.drawColorLegend(legend, data, options, colorScale)
  }

  private drawColorLegend(
    legend: d3.Selection<SVGGElement, unknown, HTMLElement, any>,
    data: ReturnType<typeof EnrichmentAnalysisComponent.preprocessData>,
    options: RenderOptions,
    colorScale: d3.ScaleSequential<string, never>
  ) {
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
    const legendAxis = d3.axisRight(legendColorScale).ticks(5)

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
      .attr("stop-color", (d) => colorScale((d / COLOR_LEGEND_HEIGHT) * (dataColorExtent[1] - dataColorExtent[0]) + dataColorExtent[0]));

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
          (
            EnrichmentAnalysisComponent.LEGEND_WIDTH / 2
            ) +
          " ," +
          10 +
          ")"
      )
      .style("fill", "url(#colorLegendGradient)");

    // Append the color legend axis
    legend
      .append("g")
      .attr("transform", "translate(" + (EnrichmentAnalysisComponent.LEGEND_WIDTH / 2 + COLOR_LEGEND_WIDTH) + ", 10)")
      .call(legendAxis);
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

  ngOnInit(): void {
    window.addEventListener("resize", this.render.bind(this));
  }

  constructor(private ea: EnrichmentAnalysisService) {}
}
