import React from "react";
import { radarAxes } from "../data/learningRadar";

export default function RadarChart({
  title,
  metrics,
  tone = "current",
  axes = radarAxes,
  eyebrow = "Current State",
  axisHelp = null,
}) {
  const center = 150;
  const radius = 100;
  const levels = [20, 40, 60, 80, 100];

  const safeAxes = Array.isArray(axes) && axes.length ? axes : radarAxes;

  const axisPoints = safeAxes.map((axis, index) => {
    const angle = ((Math.PI * 2) / safeAxes.length) * index - Math.PI / 2;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return { ...axis, angle, x, y };
  });

  const polygonPoints = axisPoints
    .map((point) => {
      const valueRadius = ((metrics?.[point.key] || 0) / 100) * radius;
      const x = center + Math.cos(point.angle) * valueRadius;
      const y = center + Math.sin(point.angle) * valueRadius;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`radar-card radar-card-${tone}`}>
      <div className="panel-header">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>

      <div className="radar-visual-wrap">
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
            const valueRadius = ((metrics?.[point.key] || 0) / 100) * radius;
            const x = center + Math.cos(point.angle) * valueRadius;
            const y = center + Math.sin(point.angle) * valueRadius;

            return <circle key={`${point.key}-dot`} cx={x} cy={y} r="4" className="radar-dot" />;
          })}
        </svg>

        <div className="radar-label-overlay">
          {axisPoints.map((point) => {
            const labelRadius = radius + 28;
            const x = center + Math.cos(point.angle) * labelRadius;
            const y = center + Math.sin(point.angle) * labelRadius;
            const labelHelp = axisHelp?.[point.key];
            const positionStyle = {
              left: `${(x / 300) * 100}%`,
              top: `${(y / 300) * 100}%`,
            };

            if (!labelHelp) {
              return (
                <span
                  key={`${point.key}-label`}
                  className="radar-label-button"
                  style={positionStyle}
                >
                  {point.label}
                </span>
              );
            }

            return (
              <button
                key={`${point.key}-label`}
                type="button"
                className={`radar-label-button radar-label-button-interactive radar-label-button-${point.key}`}
                style={positionStyle}
              >
                <span className="radar-label-button-text">{point.label}</span>
                <span className="radar-axis-tooltip" role="tooltip">
                  <strong>{labelHelp.axis || point.label}</strong>
                  <span>{labelHelp.summary}</span>
                  {labelHelp.signals?.length ? (
                    <small>{labelHelp.signals.join(" | ")}</small>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="metric-list">
        {safeAxes.map((axis) => (
          <div key={axis.key} className="metric-row">
            <div className="metric-label-wrap">
              <span>{axis.label}</span>
            </div>
            <strong>{metrics?.[axis.key] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
