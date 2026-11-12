const marker = "classroom-readonly-v1";
function base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export async function publishToGitHub(
  repository: string,
  token: string,
  html: string,
  request: typeof fetch = fetch,
): Promise<string> {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    repository.split("/").some((p) => p === "." || p === "..")
  )
    throw Error("저장소를 계정/저장소 형식으로 입력해 주세요.");
  if (
    !html.includes('name="classroom-public"') ||
    !html.includes(marker) ||
    html.includes("__CLASSROOM_PUBLIC_DATA__")
  )
    throw Error("미리보기를 먼저 만들어 주세요.");
  const root = "https://api.github.com/repos/" + repository;
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function api(path: string, init: RequestInit = {}) {
    const r = await request(root + path, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok && r.status !== 404)
      throw Error(
        r.status === 409
          ? "게시본이 다른 곳에서 변경되었습니다. 다시 시도해 주세요."
          : `GitHub 요청 실패 (${r.status}). 저장소·권한·Pages 설정을 확인해 주세요.`,
      );
    return r;
  }
  const pr = await api("/pages");
  if (!pr.ok) throw Error("이 저장소의 GitHub Pages를 먼저 활성화해 주세요.");
  const pages = await pr.json();
  if (
    pages.build_type === "workflow" ||
    !pages.source?.branch ||
    !["/", "/docs"].includes(pages.source.path)
  )
    throw Error("Pages를 Deploy from a branch 방식으로 설정해 주세요.");
  const path =
    (pages.source.path === "/docs" ? "docs/" : "") + "published/classroom.html";
  const ref = "?ref=" + encodeURIComponent(pages.source.branch);
  const existing = await api("/contents/" + path + ref);
  let sha: string | undefined;
  if (existing.ok) {
    const meta = await existing.json();
    if (!meta.sha || meta.type !== "file")
      throw Error("같은 경로의 다른 항목을 덮어쓸 수 없습니다.");
    const raw = await api("/contents/" + path + ref, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    const old = await raw.text();
    if (!old.includes('name="classroom-public"') || !old.includes(marker))
      throw Error("기존 파일이 이 앱의 게시본이 아니므로 덮어쓰지 않았습니다.");
    sha = meta.sha;
  }
  const r = await api("/contents/" + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Update classroom read-only snapshot",
      branch: pages.source.branch,
      content: base64(html),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw Error("게시 파일을 저장하지 못했습니다.");
  const url = new URL(pages.html_url);
  if (url.protocol !== "https:")
    throw Error("저장했지만 게시 주소를 확인할 수 없습니다.");
  return url.href.replace(/\/$/, "") + "/published/classroom.html";
}
