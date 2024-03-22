import { IVolcanoSelection, VolcanoPoint, VolcanoSelectionConfig, VolcanoSelectionTrigger, VolcanoSelectionType } from "./volcano.component.types";


export class VolcanoSelection implements IVolcanoSelection {

  get selectedPoints(): (VolcanoPoint & { selected: true; })[] {
    return this.points.filter(p => p.selected) as (VolcanoPoint & { selected: true; })[];
  }

  get labelledPoints(): (VolcanoPoint & { labelled: true; })[] {
    return this.points.filter(p => p.labelled) as (VolcanoPoint & { labelled: true; })[];
  }

  private geneToPointMap: Map<string, VolcanoPoint>;

  constructor(
    public readonly type: VolcanoSelectionType,
    public trigger: VolcanoSelectionTrigger,
    private points: VolcanoPoint[],
    public readonly config: VolcanoSelectionConfig,
  ) {
    this.geneToPointMap = new Map(points.map(point => [point.gene, point]));
  }

  resetData(points: VolcanoPoint[]) {
    this.points = points;
    this.geneToPointMap = new Map(points.map(point => [point.gene, point]));
  }

  sortSelection(compareFn: (a: VolcanoPoint, b: VolcanoPoint) => number) {
    this.points.sort(compareFn)
  }

  isPointSelected(point: VolcanoPoint): boolean {
    return this.geneToPointMap.get(point.gene).selected
  }

  selectSinglePoint(point: VolcanoPoint) {
    this.geneToPointMap.get(point.gene).selected = true
  }

  deselectSinglePoint(point: VolcanoPoint) {
    this.geneToPointMap.get(point.gene).selected = false
  }

  selectPoints(points: VolcanoPoint[]): void {
    this.selectPointsByGeneName(points.map(p => p.gene))
  }

  selectPointsByGeneName(genes: string[]) {
    // deselect all first to match the behavior of the volcano plot API
    this.deselectAll()
    this.applyFuncToPointsByGeneName(genes, (p) => {p.selected = true})
  }

  isPointLabelled(point: VolcanoPoint): boolean {
    return this.geneToPointMap.get(point.gene).labelled
  }

  labelSinglePoint(point: VolcanoPoint) {
    this.geneToPointMap.get(point.gene).labelled = true
  }

  unlabelSinglePoint(point: VolcanoPoint) {
    this.geneToPointMap.get(point.gene).labelled = false
  }

  labelPoints(points: VolcanoPoint[]) {
    this.labelPointsByGeneName(points.map(p => p.gene))
  }

  labelPointsByGeneName(genes: string[]) {
    // clear all labels first to match the behavior of the volcano plot API
    this.unlabelAll()
    this.applyFuncToPointsByGeneName(genes, (p) => {p.labelled = true})
  }

  private deselectAll(): void {
    this.points.forEach(p => p.selected = false)
  }

  private unlabelAll(): void {
    this.points.forEach(p => p.labelled = false)
  }

  private applyFuncToPointsByGeneName(genes: string[], func: (p : VolcanoPoint) => void) {
    genes.forEach(gene => {
      const point = this.geneToPointMap.get(gene);
      if (point) func(point)
    });
  }

}
