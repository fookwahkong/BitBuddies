import React from "react";

const personaImages = {
  crammer: "/assets/image/crammer.png",
  comfort: "/assets/image/comfort-zone%20grinder.png",
  avoider: "/assets/image/avoider.png",
  perfectionist: "/assets/image/perfectionism.png",
  sprinter: "/assets/image/sprinter.png",
};

const personaStyles = {
  crammer: {
    title: "Deadline Rush",
    accentClass: "persona-visual-crammer",
    statClass: "persona-stat-crammer",
  },
  comfort: {
    title: "Safe Momentum",
    accentClass: "persona-visual-comfort",
    statClass: "persona-stat-comfort",
  },
  avoider: {
    title: "Blind Spot Alert",
    accentClass: "persona-visual-avoider",
    statClass: "persona-stat-avoider",
  },
  perfectionist: {
    title: "Precision Loop",
    accentClass: "persona-visual-perfectionist",
    statClass: "persona-stat-perfectionist",
  },
  sprinter: {
    title: "Quick Burst",
    accentClass: "persona-visual-sprinter",
    statClass: "persona-stat-sprinter",
  },
};

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export default function PersonaVisual({
  persona,
  matchScore,
  showSummary = false,
  summaryText = "",
  className = "",
}) {
  const personaId = persona?.id || "comfort";
  const theme = personaStyles[personaId] || personaStyles.comfort;
  const avatarLabel = persona?.shortLabel?.charAt(0) || persona?.label?.charAt(0) || "P";
  const imageSrc = personaImages[personaId] || "";

  return (
    <div className={`persona-visual ${theme.accentClass} ${className}`.trim()}>
      <div className="persona-visual-art">
        {imageSrc ? (
          <img className="persona-visual-image" src={imageSrc} alt="" />
        ) : (
          <>
            <span className="persona-visual-ring" />
            <span className="persona-visual-ring persona-visual-ring-secondary" />
            <div className="persona-visual-avatar">{avatarLabel}</div>
          </>
        )}
        <span className="persona-poster-stamp">{theme.title}</span>
      </div>

      <div className="persona-visual-copy">
        <p className="eyebrow">Trusted Persona</p>
        <h3>{persona?.label || "Persona"}</h3>
        <p className="persona-visual-title">{theme.title}</p>
        <div className={`persona-match-stat ${theme.statClass}`}>
          <span>Current match</span>
          <strong>{formatPercent(matchScore)}</strong>
        </div>
        {showSummary ? <p className="persona-visual-summary">{summaryText || persona?.summary}</p> : null}
      </div>
    </div>
  );
}
