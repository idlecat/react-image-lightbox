export interface StringMap<T> {
  [index: string]: T;
}

export interface Callback<T> {
  (arg: T): any;
}
