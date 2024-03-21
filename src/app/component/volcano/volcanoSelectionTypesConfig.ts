import { VolcanoSelection, VolcanoSelectionType, VolcanoSelectionConfig } from "./volcano.component.types";
const AbstractVolcanoSelectionConfig: VolcanoSelectionConfig = {
  opacity: 0.2,
  opacityHover: 0.5,
  opacitySelected: 1,
  colorSelected: "black",
  colorUnselected: "#454444",
  disableMouseSelection: false,
  disableTooltip: false,
}

export const StandardVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,
}

export const GOTermVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,

  // force all selected points to be one color, instead of adhering to the gene regulation coloring logic.
  colorSelected: "lightblue",
  disableMouseSelection: true
}

/** factory method to create an empty selection, populated with the correct config for its type */
export function createEmptyVolcanoSelection(type: VolcanoSelectionType): VolcanoSelection {

  const configs = {
    [VolcanoSelectionType.Standard]: StandardVolcanoSelectionConfig,
    [VolcanoSelectionType.GOTerm]: GOTermVolcanoSelectionConfig
  }

  return {
    type,
    trigger: undefined,
    points: [],
    config: configs[type]
  }
}