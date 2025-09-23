export class DatumValue {
    constructor(category, measure, target, group, value, id) {
        this.category = category;
        this.measure = measure;
        this.target = target;
        this.value = value;
        this.group = group;
        this.id = id;
    }
}

export class IntervalValue{
    constructor(category, min, max, id) {
        this.category = category;
        this.min = min;
        this.max = max;
        this.id = id;
    }
}

export class ScalarValue{
    constructor(value, id) {
        this.value = value;
        this.id = id;
    }
}

export class BoolValue{
    constructor(category, bool, id) {
        this.category = category;
        this.bool = bool;
        this.id = id;
    }
}