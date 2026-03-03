interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  colorFn?: (value: number, index: number) => string
}

export function Sparkline({ data, width, height = 32, color = '#f59e0b', colorFn }: SparklineProps) {
  if (data.length === 0) return null

  const max = Math.max(...data, 1)
  const barWidth = 100 / data.length

  return (
    <svg
      width={width ?? '100%'}
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="rounded"
    >
      {data.map((value, i) => {
        const barHeight = (value / max) * height
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={height - barHeight}
            width={Math.max(barWidth - 0.5, 0.5)}
            height={barHeight}
            fill={colorFn ? colorFn(value, i) : color}
            opacity={0.8}
          />
        )
      })}
    </svg>
  )
}
