type PricePoint = {
  label: string;
  value: number;
};

type PriceChartProps = {
  title: string;
  ticker: string;
  points: PricePoint[];
  changePct: number | null;
};

function toPolyline(points: PricePoint[], width: number, height: number): string {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function PriceChart({ title, ticker, points, changePct }: PriceChartProps) {
  if (points.length < 2) {
    return null;
  }

  const polyline = toPolyline(points, 560, 140);
  const latest = points[points.length - 1]?.value ?? 0;

  return (
    <div className="price-chart-card">
      <div className="price-chart-header">
        <div>
          <h4>{title}</h4>
          <p>{ticker}</p>
        </div>
        <div className={changePct !== null && changePct >= 0 ? 'delta up' : 'delta down'}>
          {changePct === null ? 'n/a' : `${changePct}%`}
        </div>
      </div>

      <svg viewBox="0 0 560 140" role="img" aria-label={`${ticker} price trend`}>
        <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>

      <div className="price-chart-footer">
        <span>{points[0]?.label}</span>
        <strong>Last: {latest.toFixed(2)}</strong>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
