// @paged-media/ui — composite components and design-system primitives
// shared across the canvas app and (eventually) third-party
// bundles. Curated subset of shadcn primitives (re-exported from
// @paged-media/shell) plus DTP composites built on top.

export { NumberInput, type NumberInputProps } from "./inputs/NumberInput";
export { LengthInput, type LengthInputProps } from "./inputs/LengthInput";
export { ScrubField, type ScrubFieldProps } from "./inputs/ScrubField";
export { BoundsInput, type BoundsInputProps } from "./inputs/BoundsInput";
export { ColorPicker, type ColorPickerProps } from "./inputs/ColorPicker";

export type { LengthUnit } from "./inputs/units";
export { convertLength, POINTS_PER_UNIT } from "./inputs/units";
