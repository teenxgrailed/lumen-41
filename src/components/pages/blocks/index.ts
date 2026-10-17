import { Callout } from "./callout";
import { Column, Columns } from "./columns";
import { Toggle } from "./toggle";

/** The blocks that hold other blocks: the order matters (Column before Columns). */
export const pageContainerBlocks = [Toggle, Callout, Column, Columns];

export { Callout, Column, Columns, Toggle };
