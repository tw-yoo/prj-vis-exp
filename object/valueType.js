export const dataCache = [];

export class DatumValue {
    constructor(category, measure, group, value) {
        this.category = category;
        this.measure = measure;
        this.group = group;
        this.value = value;
    }
}

export class IntervalValue{
    constructor(category, min, max) {
        this.category = category;
        this.min = min;
        this.max = max;
    }
}

export class ScalarValue{
    constructor(value) {
        this.value = value;
    }
}

export class BoolValue{
    constructor(category, bool) {
        this.category = category;
        this.bool = bool;
    }
}