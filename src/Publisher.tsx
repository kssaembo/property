import { createPortal } from "react-dom";
import { useState } from "react";
import type { LocalState } from "./storage";
import { makeSnapshot, renderSnapshot, type NameMode } from "./snapshot";
import { publishToGitHub } from "./publish-client";
export default function Publisher({ local }: { local: LocalState }) {
  const [names, setNames] = useState<NameMode>("anonymous"),
    [history, setHistory] = useState(true),
    [aliases, setAliases] = useState<Record<string, string>>({}),
    [html, setHtml] = useState(""),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [repo, setRepo] = useState(""),
    [token, setToken] = useState(""),
    [url, setUrl] = useState(""),
    [full, setFull] = useState(false);
  const invalidate = () => {
    setHtml("");
    setApproved(false);
    setStatus("");
    setUrl("");
  };
  async function prepare() {
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(
        import.meta.env.BASE_URL + "published-template.html",
      );
      if (!r.ok) throw Error("게시 템플릿을 불러오지 못했습니다.");
      setHtml(
        renderSnapshot(
          await r.text(),
          makeSnapshot(local, { names, history, aliases }),
        ),
      );
      setApproved(false);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const u = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "classroom.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
    setStatus(
      "게시 파일을 내려받았습니다. 웹 호스팅에 올리면 링크로 볼 수 있습니다.",
    );
  }
  async function publish() {
    setBusy(true);
    setStatus("GitHub에 게시본 저장 중…");
    try {
      const result = await publishToGitHub(repo, token, html);
      setUrl(result);
      setStatus(
        "GitHub에 저장했습니다. Pages 배포가 완료되면 아래 주소에 반영됩니다.",
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setToken("");
      setBusy(false);
    }
  }
  return (
    <div className="publish-controls">
      <p>
        로컬 장부는 그대로 두고 현재 교실의 읽기 전용 복사본을 만듭니다. 수정
        사항은 다시 게시할 때 반영됩니다.
      </p>
      <label>
        학생 이름
        <select
          value={names}
          onChange={(e) => {
            setNames(e.target.value as NameMode);
            invalidate();
          }}
        >
          <option value="anonymous">익명 · 친구 1, 친구 2</option>
          <option value="alias">직접 정한 별칭</option>
          <option value="real">실명 공개</option>
        </select>
      </label>
      {names === "alias" && (
        <div className="alias-list">
          {local.data.students.map((s) => (
            <label key={s.id}>
              {s.name}
              <input
                maxLength={100}
                value={aliases[s.id] ?? ""}
                placeholder="별칭 (비우면 친구 번호)"
                onChange={(e) => {
                  setAliases({ ...aliases, [s.id]: e.target.value });
                  invalidate();
                }}
              />
            </label>
          ))}
        </div>
      )}
      {names === "real" && (
        <p>
          실명을 선택했습니다. 인터넷에 공개해도 되는 이름인지 확인해 주세요.
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={history}
          onChange={(e) => {
            setHistory(e.target.checked);
            invalidate();
          }}
        />{" "}
        시세 변화 그래프 포함
      </label>
      <small>
        계약서·특약·거래 금액·학생 ID·변경 이력·백업은 제외합니다. 모둠 이름과
        자리 번호는 그대로 공개됩니다.
      </small>
      <button disabled={busy} onClick={prepare}>
        1. 게시본 미리보기 만들기
      </button>
      {html && (
        <>
          <iframe
            title="읽기 전용 게시본 미리보기"
            className="publish-preview"
            sandbox="allow-scripts"
            srcDoc={html}
          />
          <button onClick={() => setFull(true)}>미리보기 크게 보기</button>
          <label className="check publish-confirm">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />{" "}
            미리보기의 이름·모둠 이름·시세가 공개되어도 괜찮습니다.
          </label>
          <button
            className="primary"
            disabled={!approved || busy}
            onClick={download}
          >
            2. 읽기 전용 게시 파일 다운로드
          </button>
          <small>
            classroom.html 한 파일을 GitHub Pages 등 정적 웹 호스팅에 올리세요.
            파일만 열어도 볼 수 있으며, 별도 서버나 학생 로그인이 필요 없습니다.
          </small>
          <details className="github-target">
            <summary>GitHub Pages에 직접 게시</summary>
            <div>
              <p>
                먼저 별도 공개용 저장소에서 Pages를 ‘Deploy from a branch’로
                설정해 주세요. 해당 저장소의 Contents 쓰기 및 Pages 읽기 권한이
                있는 토큰이 필요합니다. 토큰은 저장하지 않습니다.
              </p>
              <label>
                저장소
                <input
                  placeholder="계정/저장소"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
              </label>
              <label>
                접근 토큰
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <small>
                published/classroom.html을 생성하거나 기존 게시본을 갱신합니다.
                다른 파일은 덮어쓰지 않습니다. 게시 취소는 저장소에서 해당
                파일을 삭제하세요. Git 기록과 캐시는 남을 수 있습니다.
              </small>
              <button
                disabled={!approved || !token || !repo || busy}
                onClick={publish}
              >
                공개 게시 / 갱신
              </button>
            </div>
          </details>
        </>
      )}
      {status && <p role="status">{status}</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer">
          게시 주소 열기
        </a>
      )}
      {full &&
        createPortal(
          <div className="publish-preview-full">
            <button onClick={() => setFull(false)}>미리보기 닫기</button>
            <iframe
              title="큰 게시본 미리보기"
              sandbox="allow-scripts"
              srcDoc={html}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
