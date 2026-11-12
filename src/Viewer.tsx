import { useMemo, useState, useEffect } from "react";
import Classroom, { SeatFacts } from "./Classroom";
import { snapshotSchema, viewerState } from "./snapshot";
import type { DeskSlot } from "./classroom-layout";
export default function Viewer() {
  const [error] = useState(() => {
    try {
      snapshotSchema.parse(
        JSON.parse(document.getElementById("public-snapshot")!.textContent!),
      );
      return "";
    } catch {
      return "게시 데이터가 없거나 올바르지 않습니다.";
    }
  });
  const snapshot = useMemo(
    () =>
      error
        ? null
        : snapshotSchema.parse(
            JSON.parse(
              document.getElementById("public-snapshot")!.textContent!,
            ),
          ),
    [error],
  );
  const local = useMemo(
    () => (snapshot ? viewerState(snapshot) : null),
    [snapshot],
  );
  const [selected, setSelected] = useState<DeskSlot>();
  const [motion, setMotion] = useState(true);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(undefined);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (!local || !snapshot) return <main className="viewer-error">{error}</main>;
  return (
    <>
      <header className="public-header">
        <div>
          <strong>우리 반 부동산 거래소</strong>
          <small>
            읽기 전용 게시본 ·{" "}
            {new Date(snapshot.publishedAt).toLocaleString("ko-KR")} 기준
          </small>
        </div>
        <div className="actions">
          <span>✦ 살아 있는 우리 교실</span>
          <button onClick={() => setMotion(!motion)}>
            {motion ? "잠깐 멈추기" : "다시 움직이기"}
          </button>
        </div>
      </header>
      <main className="app-main">
        <Classroom
          local={{
            ...local,
            classroom: { ...local.classroom!, animated: motion },
          }}
          readOnly
          onSeat={setSelected}
          onGroup={() => {}}
        />
      </main>
      {selected && (
        <div className="overlay" onClick={() => setSelected(undefined)}>
          <section
            className="dialog"
            role="dialog"
            aria-label="자리 정보"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>{selected.number}번 자리</h2>
              <button onClick={() => setSelected(undefined)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="seat-dialog-content">
              {selected.property ? (
                <SeatFacts
                  data={local.data}
                  property={selected.property}
                  readOnly
                />
              ) : (
                <p>아직 등록되지 않은 자리입니다.</p>
              )}
              <small>
                게시 시점의 정보입니다. 이 화면에서는 장부를 수정할 수 없습니다.
              </small>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
