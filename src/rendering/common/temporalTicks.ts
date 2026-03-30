import * as d3 from 'd3'

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime())
}

function isStartOfDayUTC(value: Date) {
  return value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0
}

function isYearly(dates: Date[]) {
  return dates.every((value) => isStartOfDayUTC(value) && value.getUTCMonth() === 0 && value.getUTCDate() === 1)
}

function isMonthly(dates: Date[]) {
  return dates.every((value) => isStartOfDayUTC(value) && value.getUTCDate() === 1)
}

export function createTemporalTickFormatter(values: Array<Date | number>) {
  const dates = values
    .map((value) => (value instanceof Date ? value : new Date(Number(value))))
    .filter(isValidDate)

  const formatter = !dates.length
    ? d3.utcFormat('%Y-%m-%d')
    : isYearly(dates)
      ? d3.utcFormat('%Y')
      : isMonthly(dates)
        ? d3.utcFormat('%Y-%m')
        : d3.utcFormat('%Y-%m-%d')

  return (value: Date | d3.NumberValue) => {
    const date = value instanceof Date ? value : new Date(Number(value))
    return formatter(date)
  }
}
