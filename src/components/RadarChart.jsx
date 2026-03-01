import React from "react";
import { metricLabels } from "../data/demoData";

export default function RadarChart({ title, metrics, tone }) {
  const center = 150;
  const radius = 100;
  const levels = [20, 40, 60, 80, 100];

  const axisPoints = metricLabels.map((metric, index) => {
    const angle = ((Math.PI * 2) / metricLabels.length) * index - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return { ...metric, angle, x, y };
  });

  const polygonPoints = axisPoints
    .map((point) => {
      const valueRadius = (metrics[point.key] / 100) * radius;
      const x = center + Math.cos(point.angle) * valueRadius;
      const y = center + Math.sin(point.angle) * valueRadius;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`radar-card radar-card-${tone}`}>
      <div className="panel-header">
        <p className="eyebrow">{tone === "current" ? "Current State" : "Projected State"}</p>
        <h3>{title}</h3>
      </div>
      <svg viewBox="0 0 300 300" className="radar-svg" role="img" aria-label={title}>
        {levels.map((level) => {
          const levelPoints = axisPoints
            .map((point) => {
              const levelRadius = (level / 100) * radius;
              const x = center + Math.cos(point.angle) * levelRadius;
              const y = center + Math.sin(point.angle) * levelRadius;
              return `${x},${y}`;
            })
            .join(" ");

          return <polygon key={level} points={levelPoints} className="radar-grid" />;
        })}

        {axisPoints.map((point) => (
          <line
            key={point.key}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            className="radar-axis"
          />
        ))}

        <polygon points={polygonPoints} className="radar-fill" />

        {axisPoints.map((point) => {
          const valueRadius = (metrics[point.key] / 100) * radius;
          const x = center + Math.cos(point.angle) * valueRadius;
          const y = center + Math.sin(point.angle) * valueRadius;

          return <circle key={`${point.key}-dot`} cx={x} cy={y} r="4" className="radar-dot" />;
        })}

        {axisPoints.map((point) => {
          const labelRadius = radius + 28;
          const x = center + Math.cos(point.angle) * labelRadius;
          const y = center + Math.sin(point.angle) * labelRadius;

          return (
            <text
              key={`${point.key}-label`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="radar-label"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
      <div className="metric-list">
        {metricLabels.map((metric) => (
          <div key={metric.key} className="metric-row">
            <span>{metric.label}</span>
            <strong>{metrics[metric.key]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
