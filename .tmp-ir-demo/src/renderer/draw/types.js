import { DrawLineModes, DrawRectModes, DrawTextModes, } from '../interfaces';
export const DrawAction = {
    Highlight: 'highlight',
    Dim: 'dim',
    Clear: 'clear',
    Text: 'text',
    Rect: 'rect',
    Line: 'line',
    LineTrace: 'line-trace',
    BarSegment: 'bar-segment',
    Split: 'split',
    Unsplit: 'unsplit',
    Sort: 'sort',
    Filter: 'filter',
    Sum: 'sum',
    LineToBar: 'line-to-bar',
    StackedToGrouped: 'stacked-to-grouped',
    GroupedToStacked: 'grouped-to-stacked',
    Sleep: 'sleep',
};
export const DrawMark = {
    Rect: 'rect',
    Path: 'path',
    Circle: 'circle',
};
export { DrawLineModes, DrawRectModes, DrawTextModes };
