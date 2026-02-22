export type Scalar = string | number

export function values<T extends Scalar>(...items: T[]): T[] {
  return items
}

export function pair<T extends Scalar>(left: T, right: T): [T, T] {
  return [left, right]
}
