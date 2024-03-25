import { VolcanoSelection } from "./VolcanoSelection";
import {
  IVolcanoSelection,
  VolcanoSelectionType,
  VolcanoSelectionConfig,
  VolcanoSelectionTrigger,
} from "./volcano.component.types";
const AbstractVolcanoSelectionConfig: VolcanoSelectionConfig = {
  opacity: 0.2,
  opacityHover: 0.5,
  opacitySelected: 1,
  colorSelected: "black",
  colorUnselected: "#454444",
  disableMouseSelection: false,
  disableTooltip: false,
  labelOnSelection: false,
  useSelectByStatColorLogic: true,
};

export const StandardVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,
};

export const GOTermVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,

  // force all selected points to be one color, instead of adhering to the gene regulation coloring logic.
  colorSelected: "blue",
  opacity: 0.2,
  disableMouseSelection: true,
  labelOnSelection: false,
  // We want all points to be colorSelected, regardless of stats thresholds
  useSelectByStatColorLogic: false,
};

/** factory method to create an empty selection, populated with the correct config for its type */
export function createEmptyVolcanoSelection(
  type: VolcanoSelectionType
): IVolcanoSelection {
  const configs = {
    [VolcanoSelectionType.Standard]: StandardVolcanoSelectionConfig,
    [VolcanoSelectionType.GOTerm]: GOTermVolcanoSelectionConfig,
  };

  return new VolcanoSelection(
    type,
    VolcanoSelectionTrigger.Init,
    [],
    configs[type]
  );
}
