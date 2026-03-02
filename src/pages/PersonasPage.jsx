import React from "react";
import TopNav from "../components/TopNav";
import PersonaVisual from "../components/PersonaVisual";
import { personaCatalog } from "../data/learningRadar";

const personaSurfaceDetails = {
  crammer: {
    headline: "High urgency, low runway",
    strengths: ["Can mobilize quickly", "Handles pressure well"],
    watchout: "Usually leaves too much for the final stretch.",
  },
  comfort: {
    headline: "Steady pace inside familiar territory",
    strengths: ["Builds routine", "Keeps momentum up"],
    watchout: "Can stay too long in easy topics that feel safe.",
  },
  avoider: {
    headline: "Protects energy by dodging weak spots",
    strengths: ["Avoids burnout spikes", "Can stay calm longer"],
    watchout: "Weak topics tend to stay weak until they become urgent.",
  },
  perfectionist: {
    headline: "Careful, thorough, and detail heavy",
    strengths: ["Strong review habits", "Catches small mistakes"],
    watchout: "Pacing drops when one question takes too much time.",
  },
  sprinter: {
    headline: "Fast starts and short bursts",
    strengths: ["Gets moving quickly", "Can cover a lot fast"],
    watchout: "Sessions can become scattered before depth builds.",
  },
};

const orderedPersonaIds = ["crammer", "comfort", "avoider", "perfectionist", "sprinter"];

export default function PersonasPage({
  user,
  onBackHome,
  onOpenPractice,
  onOpenToDo,
  onOpenJudge,
  onSignOut,
}) {
  const rankedScores = user?.persona?.ranked?.reduce((scores, persona) => {
    scores[persona.id] = persona.matchScore;
    return scores;
  }, {}) || {};

  return (
    <main className="screen-shell">
      <TopNav
        user={user}
        onOpenPractice={onOpenPractice}
        onOpenToDo={onOpenToDo}
        onOpenJudge={onOpenJudge}
        onOpenPersonas={() => {}}
        onGoHome={onBackHome}
        onSignOut={onSignOut}
        activePage="personas"
      />

      <section className="hero-card persona-guide-hero">
        <div className="hero-copy">
          <p className="eyebrow">Learning Personas</p>
          <p className="hero-kicker">How BitBuddies reads study behavior</p>
          <h1>Each persona is a quick pattern, not a permanent identity.</h1>
          <p className="hero-text">
            This page gives the surface-level meaning of the five learning personas. It is meant to help students
            understand the label at a glance before we add deeper coaching notes for each one.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card stat-card-highlight">
            <span className="stat-label">Your trusted persona</span>
            <strong>{user?.persona?.primary?.label || "Not available"}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Current match</span>
            <strong>{Math.round((user?.persona?.primary?.matchScore || 0) * 100)}%</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Use</span>
            <strong>Interpret the pattern, then adjust the next study move.</strong>
          </div>
        </div>
      </section>

      <section className="student-card persona-guide-grid">
        {orderedPersonaIds.map((personaId) => {
          const persona = personaCatalog[personaId];
          const details = personaSurfaceDetails[personaId];
          const isTrusted = user?.persona?.primary?.id === personaId;

          return (
            <article
              key={personaId}
              className={`persona-guide-card${isTrusted ? " persona-guide-card-active" : ""}`}
            >
              <div className="persona-guide-top">
                <PersonaVisual
                  persona={persona}
                  matchScore={rankedScores[personaId]}
                  showSummary={false}
                  className="persona-guide-visual"
                />
                {isTrusted ? <span className="snapshot-pill persona-guide-pill">Your current fit</span> : null}
              </div>

              <div className="persona-guide-copy">
                <p className="eyebrow">Surface read</p>
                <h3>{details.headline}</h3>
                <p className="student-helper">{persona.summary}</p>
              </div>

              <div className="persona-tag-row">
                {details.strengths.map((item) => (
                  <span key={item} className="persona-tag">
                    {item}
                  </span>
                ))}
              </div>

              <p className="persona-watchout">
                <strong>Watch-out:</strong> {details.watchout}
              </p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
