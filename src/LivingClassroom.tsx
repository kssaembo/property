import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createActors, tickActors, phases, conversations } from "./life";
export default function LivingClassroom({
  spread,
  enabled,
}: {
  spread: number;
  enabled: boolean;
}) {
  const [actors, setActors] = useState(createActors);
  const [elapsed, setElapsed] = useState(0);
  const [dialogue, setDialogue] = useState(0);
  const [reduced, setReduced] = useState(false);
  const age = useRef(0);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const fn = () => setReduced(q.matches);
    q.addEventListener("change", fn);
    return () => q.removeEventListener("change", fn);
  }, []);
  useEffect(() => {
    if (!enabled || reduced) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.15, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      age.current += dt;
      const phase = Math.floor(age.current / 55) % phases.length;
      setElapsed(age.current);
      setActors((a) => tickActors(a, dt, phase));
    }, 100);
    return () => clearInterval(t);
  }, [enabled, reduced]);
  useEffect(() => {
    if (!enabled || reduced) return;
    const t = setInterval(() => {
      if (!document.hidden)
        setDialogue(
          (i) => (i + 1 + Math.floor(Math.random() * 3)) % conversations.length,
        );
    }, 13000);
    return () => clearInterval(t);
  }, [enabled, reduced]);
  const phase = Math.floor(elapsed / 55) % phases.length;
  const half = Math.floor(elapsed / 5) % 2;
  const pair = Math.floor(elapsed / 13) % 4;
  return (
    <>
      <div className="life-phase" aria-label="자동으로 바뀌는 교실 활동">
        <i />
        {!enabled || reduced ? "잠시 쉬는 교실" : phases[phase]}
        <small>{!enabled || reduced ? "활동 일시 정지" : "자동 전환 중 · 활동 안내"}</small>
      </div>
      {actors.map((a) => {
        const pose =
          a.activity === "read"
            ? 3
            : a.activity === "walk"
              ? a.facing === "back"
                ? 2
                : a.facing === "front"
                  ? 0
                  : 1
              : 0;
        const talking = enabled && !reduced && a.id === pair * 2 + half;
        return (
          <div
            aria-hidden="true"
            key={a.id}
            className={"life-actor " + a.activity}
            style={
              {
                left: a.x * spread,
                top: a.y,
                zIndex: Math.round(a.y),
              } as CSSProperties
            }
          >
            <div className="actor-shadow" />
            <div
              className="actor-sprite"
              style={{
                backgroundPosition: `${(pose * 100) / 3}% ${((a.id % 4) * 100) / 3}%`,
                transform: a.facing === "left" ? "scaleX(-1)" : undefined,
              }}
            />
            {a.activity === "water" && (
              <span className="activity-prop">💧</span>
            )}
            {a.activity === "listen" && (
              <span className="activity-prop">✎</span>
            )}
            {talking && (
              <span className="life-bubble" key={`${dialogue}-${half}`}>
                {phase === 2
                  ? half
                    ? "응! 천천히 따라 해 보자."
                    : "선생님 말씀에 귀 기울여요."
                  : conversations[dialogue][half]}
                <i />
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

