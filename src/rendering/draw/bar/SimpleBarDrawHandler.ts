import { BarDrawHandler } from '../BarDrawHandler'

/**
 * Simple-bar specific draw handler.
 * Currently inherits all behaviors from BarDrawHandler (highlight/dim/text/rect/line/bar-segment/sort/filter).
 * Separated for clearer layering: BaseDrawHandler -> BarDrawHandler -> SimpleBarDrawHandler.
 */
export class SimpleBarDrawHandler extends BarDrawHandler {}

