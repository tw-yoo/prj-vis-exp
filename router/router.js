import {
    opsRetrieveValue,
    opsFilter,
    opsFindExtremum,
    opsDetermineRange,
    opsMakeComparisons,
    opsSort
} from '../functions.js';
import { validateAtomicOpsSpec } from "./routerUtil.js";
import {getChartType} from "../util/util.js";
import {ChartType} from "../object/chartType.js";
import {runSimpleBarOps} from "../operations/bar/simple/simpleBarUtil.js";
import {runSimpleLineOps} from "../operations/line/simple/simpleLineUtil.js";

export async function executeAtomicOps(vlSpec, opsSpec) {
    if (validateAtomicOpsSpec(opsSpec)) {
        console.error('Atomic-Ops Spec Error:', error);
        return;
    }

    const chartType = getChartType(vlSpec);

    switch (chartType) {
        case ChartType.SIMPLE_BAR:
            await runSimpleBarOps("chart", opsSpec);
            break
        case ChartType.STACKED_BAR:
            // await runStackedBarOps(opsSpec);
            break
        case ChartType.GROUPED_BAR:
            // await runGroupedBarOps(opsSpec);
            break
        case ChartType.MULTIPLE_BAR:
            // await runMultipleBarOps(opsSpec);
            break
        case ChartType.SIMPLE_LINE:
            await runSimpleLineOps("chart", opsSpec);
            break
        case ChartType.MULTI_LINE:
            // await runMultiLineOps(opsSpec);
            break
    }

    return
    // 아래 함수는 사용하지 않을 예정
    for (const operation of opsSpec.ops) {
        switch (operation.op) {
            case 'retrieveValue':
                await opsRetrieveValue(vlSpec, operation.field, operation.keyField, operation.key);
                break;
            case 'filter':
                await opsFilter(vlSpec, operation.field, operation.operator, operation.value);
                break;
            case 'findExtremum':
                await opsFindExtremum(vlSpec, operation.field, operation.which);
                break;
            case 'determineRange':
                await opsDetermineRange(vlSpec, operation.field);
                break;
            case 'compare':
                await opsMakeComparisons(
                    vlSpec,
                    operation.field,
                    operation.leftKeyField,
                    operation.leftValue,
                    operation.operator,
                    operation.rightValue
                );
                break;
            case 'sort':
                await opsSort(vlSpec, operation.keyField, operation.valueField, operation.field, operation.order);
                break;
            default:
                console.warn(`Unknown operation "${operation.op}"`);
        }
    }
}
