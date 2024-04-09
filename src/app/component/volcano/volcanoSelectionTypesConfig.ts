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
  strokeSelected: undefined,
  strokeUnselected: undefined,
  strokeWidthUnselected: 0,
  strokeWidthSelected: 0,
  disableMouseSelection: false,
  disableTooltip: false,
  labelOnSelection: false,
  useSelectByStatColorLogic: true,
  deferInteractiveColoringLogicTo: null,
};

export const StandardVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,
};

export const GOTermVolcanoSelectionConfig: VolcanoSelectionConfig = {
  ...AbstractVolcanoSelectionConfig,

  // white points with black border
  colorSelected: "transparent",
  strokeSelected: "black",
  strokeWidthSelected: 1.5,

  // reduce the opacity of the background points
  opacity: 0.1,

  disableMouseSelection: true,

  // We want all points to be colorSelected, regardless of stats thresholds
  useSelectByStatColorLogic: false,

  // when the user hovers over points, we want to color them based on the Standard selection logic, since the GO Term selection is based on the stroke, not color.
  deferInteractiveColoringLogicTo: VolcanoSelectionType.Standard,
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
