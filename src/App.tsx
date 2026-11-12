import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  collections,
  emptyExchange,
  uid,
  today,
  type Contract,
  type Exchange,
  type Collection,
  validateExchange,
  serializeExchange,
} from "../shared/exchange";
import {
  clone,
  refresh,
  saveContract,
  setPrice,
  stateAt,
  stats,
  assertBusiness,
} from "./domain";
import { readState, writeState, lastBackup, type LocalState } from "./storage";
import {
  preview,
  merge,
  csvExport,
  csvImport,
  download,
  type Difference,
} from "./transfer";

const labels = {
  sale: "매매",
  jeonse: "전세",
  rent: "월세",
  active: "유효",
  ended: "종료",
  cancelled: "취소",
};
const num = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(v);
const field = (f: FormData, k: string) => String(f.get(k) ?? "");
export default function App() {
  const [local, setLocal] = useState<LocalState>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [, setClock] = useState(0);
  const [tab, setTab] = useState("배치도");
  const [selected, setSelected] = useState("");
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState("");
  const [modal, setModal] = useState("");
  const [editing, setEditing] = useState<Contract>();
  const [diffs, setDiffs] = useState<Difference[]>();
  const [busy, setBusy] = useState(false);
  const [editMap, setEditMap] = useState(false);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [zoom, setZoom] = useState(100);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [csvKind, setCsvKind] = useState<Collection>("properties");
  const drag = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    readState()
      .then((s) =>
        setLocal(
          s ?? {
            data: emptyExchange("class-" + uid()),
            image: null,
            settings: {
              price: true,
              owner: true,
              status: true,
              autoPrice: false,
            },
            audits: [],
            sequence: 0,
            periodViews: {},
          },
        ),
      )
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const t = setInterval(() => setClock((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const d = local?.data;
  const p = d?.properties.find((p) => p.id === selected);
  const activePeriod = d?.periods.find((p) => p.id === period);
  const stat = d
    ? stats(d, activePeriod?.startDate, activePeriod?.endDate)
    : null;
  const name = (id: string | null | undefined) =>
    d?.students.find((s) => s.id === id)?.name ?? "미지정";
  async function commit(
    data: Exchange,
    action: string,
    extras: Partial<LocalState> = {},
    backup = false,
  ) {
    if (!local || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      validateExchange(data);
      const next = {
        ...local,
        ...extras,
        data,
        sequence: local.sequence + 1,
        audits: [
          ...(extras.audits ?? local.audits),
          {
            at: new Date().toISOString(),
            action,
            before: local.data,
            after: data,
          },
        ],
      };
      await writeState(next, backup);
      setLocal(next);
      setNotice(action + " 완료");
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function attempt(fn: () => void) {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function formSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!d || !local) return;
    const f = new FormData(e.currentTarget);
    try {
      let next = clone(d);
      let extra: Partial<LocalState> = {};
      if (modal === "student") {
        const id = studentId || uid();
        const s = next.students.find((s) => s.id === id);
        if (s) {
          s.name = field(f, "name");
          s.revision = (s.revision ?? 1) + 1;
          s.updatedAt = new Date().toISOString();
        } else
          next.students.push({
            id,
            name: field(f, "name"),
            revision: 1,
            updatedAt: new Date().toISOString(),
          });
      }
      if (modal === "property") {
        const existing = p;
        const owner = field(f, "owner") || null;
        const price = Number(f.get("market"));
        if (existing) {
          existing.id;
          const target = next.properties.find((q) => q.id === existing.id)!;
          target.seatNumber = field(f, "seat");
          if (!d.contracts.some((c) => c.propertyId === existing.id)) {
            target.ownerId = owner;
            target.occupantId = owner;
            target.initialOwnerId = owner;
          }
          target.auctionPrice = Number(f.get("auction"));
          target.revision++;
          next = setPrice(next, target.id, price);
        } else {
          const id = uid();
          next.properties.push({
            id,
            seatNumber: field(f, "seat"),
            ownerId: owner,
            occupantId: owner,
            initialOwnerId: owner,
            initialSalePrice: null,
            auctionPrice: Number(f.get("auction")),
            latestSalePrice: null,
            marketPrice: price,
            position: null,
            revision: 1,
            updatedAt: new Date().toISOString(),
          });
          next.marketHistory.push({
            id: uid(),
            propertyId: id,
            price,
            recordedAt: new Date().toISOString(),
          });
          setSelected(id);
        }
      }
      if (modal === "contract") {
        if (!p) throw Error("자리를 선택하세요");
        const type = field(f, "type") as Contract["type"];
        const sale = type === "sale";
        next = saveContract(d, {
          id: editing?.id ?? uid(),
          propertyId: p.id,
          type,
          sellerId: sale ? field(f, "from") || null : null,
          buyerId: sale ? field(f, "to") : null,
          landlordId: sale ? null : field(f, "from"),
          tenantId: sale ? null : field(f, "to"),
          amount: Number(f.get("amount")),
          paymentCycle: type === "rent" ? field(f, "cycle") : null,
          contractDate: field(f, "date"),
          startDate: sale ? field(f, "date") : field(f, "start"),
          endDate: sale ? null : field(f, "end"),
          terms: field(f, "terms"),
          status: editing?.status ?? "active",
          revision: editing?.revision ?? 1,
          endedAt: editing?.endedAt,
        });
        if (
          local.settings.autoPrice &&
          sale &&
          next.contracts.find(
            (c) => c.id === (editing?.id ?? next.contracts.at(-1)?.id),
          )?.status !== "cancelled"
        )
          next = setPrice(next, p.id, Number(f.get("amount")));
      }
      if (modal === "period") {
        const id = uid(),
          mode = field(f, "mode");
        next.periods.push({
          id,
          label: field(f, "label"),
          startDate: field(f, "start"),
          endDate: field(f, "end"),
        });
        extra.periodViews = {
          ...local.periodViews,
          [id]: {
            mode,
            image: mode === "empty" ? null : local.image,
            properties:
              mode === "empty"
                ? []
                : clone(d.properties).map((p) =>
                    mode === "layout"
                      ? { ...p, ownerId: null, occupantId: null }
                      : p,
                  ),
          },
        };
        setPeriod(id);
      }
      if (modal === "periodSnapshot" && period) {
        const old = local.periodViews[period];
        extra.periodViews = {
          ...local.periodViews,
          [period]: {
            ...old,
            properties: d.properties
              .filter((q) => f.has("include-" + q.id))
              .map((q) => ({
                ...clone(q),
                ownerId: field(f, "owner-" + q.id) || null,
                occupantId: field(f, "owner-" + q.id) || null,
              })),
          },
        };
      }
      if (modal === "settings") {
        const classId = field(f, "classId");
        if (
          classId !== d.classId &&
          d.students.length + d.properties.length + d.contracts.length > 0
        )
          throw Error("자료가 있는 학급의 ID는 바꿀 수 없습니다");
        next.classId = classId;
        extra.settings = {
          price: f.has("price"),
          owner: f.has("owner"),
          status: f.has("status"),
          autoPrice: f.has("autoPrice"),
        };
      }
      if (modal === "price" && p)
        next = setPrice(d, p.id, Number(f.get("price")));
      assertBusiness(next);
      if (
        await commit(
          next,
          modal === "contract" ? "계약 저장" : "정보 저장",
          extra,
        )
      )
        setModal("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function fileImport(file: File | undefined, csv = false) {
    if (!file || !d) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("20MB 이하 파일을 선택하세요");
      const text = await file.text();
      const incoming = csv ? csvImport(d, csvKind, text) : JSON.parse(text);
      setDiffs(preview(d, incoming));
      setModal("import");
      setError("");
    } catch (e) {
      setError(
        "가져오기 검증 실패: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  async function imageUpload(file: File | undefined) {
    if (!file || !d) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw Error("PNG, JPG, WEBP 10MB 이하만 지원합니다");
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => reject(Error("이미지를 읽을 수 없습니다"));
        img.src = url;
      });
      await commit(d, "배치도 업로드", { image: url });
    } catch (e) {
      setError(String(e));
    }
  }
  function exportJSON() {
    if (d)
      download(
        serializeExchange(refresh(clone(d))),
        `ClassBank_부동산_${today()}.json`,
      );
  }
  async function changeStatus(c: Contract, status: "ended" | "cancelled") {
    if (!d) return;
    if (
      !window.confirm(
        `${labels[c.type]} 계약을 ${labels[status]} 처리할까요? 기록은 보존됩니다.`,
      )
    )
      return;
    try {
      const endedAt =
        status === "ended" && c.type !== "sale"
          ? prompt(
              "실제 종료일 (이 날짜까지 사용, 다음 날 소유자 사용)",
              today(),
            )
          : undefined;
      if (endedAt === null) return;
      const next = saveContract(d, {
        ...c,
        status,
        ...(endedAt ? { endedAt } : {}),
      });
      if (await commit(next, "계약 " + labels[status])) setModal("");
    } catch (e) {
      setError(String(e));
    }
  }
  if (!local || !d || !stat)
    return (
      <main className="loading">{error || "거래소를 준비하고 있어요…"}</main>
    );
  const contracts = d.contracts.filter(
    (c) =>
      (!filter || c.type === filter) &&
      (!search ||
        d.properties
          .find((p) => p.id === c.propertyId)
          ?.seatNumber.includes(search)) &&
      (!activePeriod ||
        (c.contractDate >= activePeriod.startDate &&
          c.contractDate <= activePeriod.endDate)),
  );
  const options = (
    <>
      <option value="">미지정</option>
      {d.students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.id.slice(0, 8)}
        </option>
      ))}
    </>
  );
  const renderContracts = (cs: Contract[]) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>계약일 / 자리</th>
            <th>유형 / 상태</th>
            <th>당사자</th>
            <th>금액</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {cs.map((c) => (
            <tr key={c.id}>
              <td>
                {c.contractDate}
                <small>
                  {d.properties.find((p) => p.id === c.propertyId)?.seatNumber}
                  번 자리
                </small>
              </td>
              <td>
                {labels[c.type]}
                <small>
                  {labels[c.status]}
                  {c.type !== "sale" &&
                    c.status === "active" &&
                    (c.endDate! < today()
                      ? " · 만료"
                      : c.startDate > today()
                        ? " · 예정"
                        : "")}
                </small>
              </td>
              <td>
                {name(c.sellerId ?? c.landlordId)} →{" "}
                {name(c.buyerId ?? c.tenantId)}
                <small>
                  {c.type !== "sale"
                    ? `${c.startDate} ~ ${c.endedAt ?? c.endDate}`
                    : ""}
                </small>
              </td>
              <td>
                {num(c.amount)}권<small>{c.paymentCycle}</small>
              </td>
              <td>
                <button
                  onClick={() => {
                    setSelected(c.propertyId);
                    setEditing(c);
                    setModal("contract");
                  }}
                >
                  상세·수정
                </button>
                {c.status === "active" && (
                  <button onClick={() => changeStatus(c, "ended")}>종료</button>
                )}
                {c.status !== "cancelled" && (
                  <button onClick={() => changeStatus(c, "cancelled")}>
                    취소
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!cs.length && <div className="empty small">등록된 계약이 없습니다.</div>}
    </div>
  );
  return (
    <>
      <header>
        <div className="brand">
          <span className="logo">▦</span>
          <div>
            <strong>우리 반 부동산 거래소</strong>
            <small>CLASSROOM PROPERTY EXCHANGE</small>
          </div>
        </div>
        <div className="actions">
          <span className="local-badge">● 이 브라우저에 저장</span>
          <button onClick={() => setModal("transfer")}>
            가져오기 · 내보내기
          </button>
          <button onClick={() => setModal("settings")}>설정</button>
        </div>
      </header>
      <main>
        <section className="heading">
          <div>
            <span className="eyebrow">우리 교실의 작은 부동산 시장</span>
            <h1>한눈에 보는 우리 반 자리</h1>
            <p>자리의 가치부터 계약의 기록까지, 차근차근 관리해요.</p>
          </div>
          <div className="period">
            <select
              aria-label="거래 기간"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="">전체 거래 기간</option>
              {d.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button onClick={() => setModal("period")}>＋ 새 기간</button>
          </div>
        </section>
        <section className="metrics">
          {[
            ["전체 자리", stat.seats, "개"],
            ["평균 시세", num(stat.averageMarket), "권"],
            ["최고 매매가", num(stat.max), "권"],
            ["기간 거래", stat.count, "건"],
          ].map(([label, value, unit]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>
                {value}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
        </section>
        <div className="notice">
          로그인 없이 사용하는 로컬 전용 서비스입니다. 다른 기기와 자동 공유되지
          않으며, 브라우저 데이터 삭제 전 JSON과 배치도 이미지를 백업하세요.
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
            <button onClick={() => setError("")}>닫기</button>
          </div>
        )}
        {notice && (
          <div role="status" className="success">
            {notice}
          </div>
        )}
        <nav>
          {[
            "배치도",
            "전체 부동산",
            "학생별 현황",
            "거래 내역",
            "기간별 통계",
            "변경 이력",
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === "배치도" && (
          <div className="workspace">
            <section className="panel map-panel">
              <div className="panel-head">
                <div>
                  <h2>교실 자리 배치도</h2>
                  <small>자리를 선택하면 상세정보를 볼 수 있어요.</small>
                </div>
                <div className="actions">
                  <label className="button">
                    이미지 {local.image ? "교체" : "업로드"}
                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => imageUpload(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    onClick={() => {
                      setEditMap(!editMap);
                      setPositions(
                        Object.fromEntries(
                          d.properties
                            .filter((p) => p.position)
                            .map((p) => [p.id, p.position!]),
                        ),
                      );
                    }}
                  >
                    {" "}
                    {editMap ? "편집 취소" : "위치 편집"}
                  </button>
                </div>
              </div>
              {editMap && (
                <div className="map-tools">
                  <select
                    aria-label="배치할 자리"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">배치할 자리 선택</option>
                    {d.properties.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.seatNumber}번
                      </option>
                    ))}
                  </select>
                  <span>이미지 클릭 또는 마커 드래그</span>
                  <button
                    onClick={async () => {
                      const next = clone(d);
                      next.properties.forEach((p) => {
                        if (positions[p.id]) {
                          p.position = positions[p.id];
                          p.revision++;
                          p.updatedAt = new Date().toISOString();
                        }
                      });
                      if (await commit(next, "자리 위치 저장"))
                        setEditMap(false);
                    }}
                  >
                    위치 저장
                  </button>
                </div>
              )}
              <div className="map-scroll">
                <div
                  className="map"
                  style={{ width: zoom + "%" }}
                  onPointerDown={(e) => {
                    if (!editMap || !selected || !local.image) return;
                    drag.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const r = e.currentTarget.getBoundingClientRect();
                    setPositions((v) => ({
                      ...v,
                      [selected]: {
                        x: Math.max(
                          0,
                          Math.min(1, (e.clientX - r.left) / r.width),
                        ),
                        y: Math.max(
                          0,
                          Math.min(1, (e.clientY - r.top) / r.height),
                        ),
                      },
                    }));
                  }}
                  onPointerMove={(e) => {
                    if (!drag.current || !editMap || !selected) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setPositions((v) => ({
                      ...v,
                      [selected]: {
                        x: Math.max(
                          0,
                          Math.min(1, (e.clientX - r.left) / r.width),
                        ),
                        y: Math.max(
                          0,
                          Math.min(1, (e.clientY - r.top) / r.height),
                        ),
                      },
                    }));
                  }}
                  onPointerUp={() => (drag.current = false)}
                  onPointerCancel={() => (drag.current = false)}
                >
                  {local.image ? (
                    <img
                      src={local.image}
                      alt="교실 자리 배치도"
                      draggable={false}
                    />
                  ) : (
                    <div className="empty">
                      <span className="empty-icon">▦</span>
                      <h3>우리 교실의 배치도를 올려주세요</h3>
                      <p>
                        학생과 자리를 등록한 뒤,
                        <br />
                        이미지 위에 자리 마커를 배치할 수 있어요.
                      </p>
                      <label className="button primary">
                        배치도 이미지 선택
                        <input
                          hidden
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => imageUpload(e.target.files?.[0])}
                        />
                      </label>
                      <small>PNG · JPG · WEBP / 최대 10MB</small>
                    </div>
                  )}
                  {local.image &&
                    d.properties.map((q) => {
                      const pos = editMap ? positions[q.id] : q.position;
                      if (!pos) return null;
                      const state = stateAt(d, q);
                      return (
                        <button
                          aria-label={`${q.seatNumber}번 자리`}
                          className={
                            "marker " +
                            (q.id === selected ? "selected " : "") +
                            (state.lease ? "leased" : "")
                          }
                          style={{
                            left: pos.x * 100 + "%",
                            top: pos.y * 100 + "%",
                          }}
                          key={q.id}
                          onPointerDown={(e) => {
                            if (editMap) {
                              e.stopPropagation();
                              setSelected(q.id);
                              drag.current = true;
                              e.currentTarget.parentElement!.setPointerCapture(
                                e.pointerId,
                              );
                            }
                          }}
                          onClick={() => setSelected(q.id)}
                        >
                          <b>{q.seatNumber}</b>
                          {local.settings.price && (
                            <span>{num(q.marketPrice)}권</span>
                          )}
                          {local.settings.owner && (
                            <small>{name(state.ownerId)}</small>
                          )}
                          {local.settings.status && (
                            <small>
                              {state.lease
                                ? labels[state.lease.type]
                                : "소유자 사용"}
                            </small>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
              <div className="map-footer">
                <span>
                  ● 소유자 사용　<span className="orange">● 임대 중</span>
                </span>
                <label>
                  확대{" "}
                  <input
                    aria-label="배치도 확대"
                    type="range"
                    min="100"
                    max="200"
                    value={zoom}
                    onChange={(e) => setZoom(+e.target.value)}
                  />
                  {zoom}%
                </label>
              </div>
            </section>
            <aside className="panel detail">
              <div className="panel-head">
                <h2>{p ? `${p.seatNumber}번 자리` : "자리 상세정보"}</h2>
                <button
                  onClick={() => {
                    setSelected("");
                    setModal("property");
                  }}
                >
                  ＋ 자리
                </button>
              </div>
              {p ? (
                <>
                  <div className="price">
                    <small>현재 시세</small>
                    <strong>
                      {num(p.marketPrice)} <span>권</span>
                    </strong>
                    <button onClick={() => setModal("price")}>시세 수정</button>
                  </div>
                  <dl>
                    <dt>현재 소유자</dt>
                    <dd>{name(stateAt(d, p).ownerId)}</dd>
                    <dt>현재 사용자</dt>
                    <dd>{name(stateAt(d, p).occupantId)}</dd>
                    <dt>최초 낙찰가격</dt>
                    <dd>{num(p.auctionPrice)}권</dd>
                    <dt>최근 매매가격</dt>
                    <dd>{num(stateAt(d, p).latestSalePrice)}권</dd>
                    <dt>계약 상태</dt>
                    <dd>
                      {stateAt(d, p).lease
                        ? labels[stateAt(d, p).lease!.type]
                        : "소유자 사용"}
                    </dd>
                  </dl>
                  <button
                    className="primary wide"
                    onClick={() => {
                      setEditing(undefined);
                      setModal("contract");
                    }}
                  >
                    ＋ 계약 등록
                  </button>
                  <button className="wide" onClick={() => setModal("property")}>
                    자리 정보 수정
                  </button>
                  <h3>시세 흐름</h3>
                  <PriceChart
                    values={d.marketHistory
                      .filter((m) => m.propertyId === p.id)
                      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
                      .map((m) => m.price)}
                  />
                  <small className="id">자리 ID: {p.id}</small>
                  <h3>계약 기록</h3>
                  {d.contracts
                    .filter((c) => c.propertyId === p.id)
                    .map((c) => (
                      <button
                        className="history-item"
                        key={c.id}
                        onClick={() => {
                          setEditing(c);
                          setModal("contract");
                        }}
                      >
                        {labels[c.type]} · {num(c.amount)}권{" "}
                        <small>
                          {c.contractDate} · {labels[c.status]}
                        </small>
                      </button>
                    ))}
                </>
              ) : (
                <div className="empty small">
                  <span className="empty-icon">⌖</span>
                  <h3>어떤 자리가 궁금한가요?</h3>
                  <p>
                    배치도 또는 전체 부동산에서
                    <br />
                    자리를 선택해 주세요.
                  </p>
                  <button
                    onClick={() => {
                      setStudentId("");
                      setModal("student");
                    }}
                  >
                    먼저 학생 등록
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}
        {tab === "전체 부동산" && (
          <section className="panel">
            <div className="panel-head">
              <h2>전체 부동산 · {d.properties.length}</h2>
              <button
                className="primary"
                onClick={() => {
                  setSelected("");
                  setModal("property");
                }}
              >
                ＋ 자리 등록
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>자리</th>
                    <th>소유자</th>
                    <th>사용자</th>
                    <th>시세</th>
                    <th>최초 낙찰가</th>
                    <th>최근 매매가</th>
                    <th>위치</th>
                  </tr>
                </thead>
                <tbody>
                  {d.properties.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <button
                          onClick={() => {
                            setSelected(q.id);
                            setTab("배치도");
                          }}
                        >
                          {q.seatNumber}번 →
                        </button>
                      </td>
                      <td>{name(stateAt(d, q).ownerId)}</td>
                      <td>{name(stateAt(d, q).occupantId)}</td>
                      <td>{num(q.marketPrice)}권</td>
                      <td>{num(q.auctionPrice)}권</td>
                      <td>{num(stateAt(d, q).latestSalePrice)}권</td>
                      <td>{q.position ? "배치됨" : "미배치"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!d.properties.length && (
              <div className="empty small">
                기존 경매 결과를 바탕으로 첫 자리를 등록하세요.
              </div>
            )}
          </section>
        )}
        {tab === "학생별 현황" && (
          <section className="panel">
            <div className="panel-head">
              <h2>학생별 보유 현황</h2>
              <button
                className="primary"
                onClick={() => {
                  setStudentId("");
                  setModal("student");
                }}
              >
                ＋ 학생 등록
              </button>
            </div>
            <div className="student-grid">
              {d.students.map((s) => (
                <button
                  className={
                    "student-card " + (studentId === s.id ? "chosen" : "")
                  }
                  key={s.id}
                  onClick={() => setStudentId(s.id)}
                >
                  <span className="avatar">{s.name.slice(0, 1)}</span>
                  <b>{s.name}</b>
                  <small>{s.id.slice(0, 8)}</small>
                  <p>
                    소유{" "}
                    {
                      d.properties.filter((p) => stateAt(d, p).ownerId === s.id)
                        .length
                    }{" "}
                    · 사용{" "}
                    {
                      d.properties.filter(
                        (p) => stateAt(d, p).occupantId === s.id,
                      ).length
                    }
                  </p>
                </button>
              ))}
            </div>
            {studentId && (
              <div className="student-detail">
                <h3>
                  {name(studentId)}의 부동산{" "}
                  <button onClick={() => setModal("student")}>이름 수정</button>
                </h3>
                <p>
                  소유 자리:{" "}
                  {d.properties
                    .filter((p) => stateAt(d, p).ownerId === studentId)
                    .map((p) => p.seatNumber)
                    .join(", ") || "없음"}{" "}
                  / 사용 자리:{" "}
                  {d.properties
                    .filter((p) => stateAt(d, p).occupantId === studentId)
                    .map((p) => p.seatNumber)
                    .join(", ") || "없음"}
                </p>
                <p>
                  누적 매매 참여금액:{" "}
                  {num(
                    d.contracts
                      .filter(
                        (c) =>
                          c.type === "sale" &&
                          c.status !== "cancelled" &&
                          [c.buyerId, c.sellerId].includes(studentId),
                      )
                      .reduce((sum, c) => sum + c.amount, 0),
                  )}
                  권
                </p>
                {renderContracts(
                  d.contracts.filter((c) =>
                    [c.buyerId, c.sellerId, c.landlordId, c.tenantId].includes(
                      studentId,
                    ),
                  ),
                )}
              </div>
            )}
          </section>
        )}
        {tab === "거래 내역" && (
          <section className="panel">
            <div className="panel-head">
              <h2>계약 및 거래 내역</h2>
              <div className="actions">
                <input
                  placeholder="자리번호 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="거래 유형"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">모든 거래</option>
                  {(["sale", "jeonse", "rent"] as const).map((t) => (
                    <option value={t} key={t}>
                      {labels[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {renderContracts(contracts)}
          </section>
        )}
        {tab === "기간별 통계" && (
          <section className="panel">
            <div className="panel-head">
              <h2>{activePeriod?.label ?? "전체 기간"} 통계</h2>
              <button onClick={() => setModal("period")}>＋ 기간 만들기</button>
            </div>
            <div className="statistics">
              {[
                ["매매 완료 자리", stat.sold],
                ["전세 계약", stat.jeonse],
                ["월세 계약", stat.rent],
                ["현재 임대 자리", stat.leased],
                ["평균 매매가격", num(stat.averageSale) + "권"],
                ["최저 매매가격", num(stat.min) + "권"],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <p className="padded">
              계약 통계는 계약일 기준이며 취소 계약을 제외합니다. 현재 시세와
              임대 현황은 오늘 기준입니다. 기간 변경은 실제 계약에 영향을 주지
              않습니다.
            </p>
            {period && local.periodViews[period] && (
              <div className="padded">
                <h3>
                  기간 시작 참고 현황{" "}
                  <button onClick={() => setModal("periodSnapshot")}>
                    현황 편집
                  </button>
                </h3>
                <p>
                  생성 당시의 배치도·소유 현황을 별도로 보존합니다. 실제
                  소유권은 계약으로 관리합니다.
                </p>
                {local.periodViews[period].image && (
                  <img
                    className="snapshot"
                    src={local.periodViews[period].image!}
                    alt="기간 생성 당시 배치도"
                  />
                )}
                <p>
                  {local.periodViews[period].properties
                    .map((p) => `${p.seatNumber}번: ${name(p.ownerId)}`)
                    .join(" / ") || "빈 현황"}
                </p>
              </div>
            )}
          </section>
        )}
        {tab === "변경 이력" && (
          <section className="panel">
            <div className="panel-head">
              <h2>수정 이력 · {local.audits.length}</h2>
              <button
                onClick={() =>
                  download(
                    JSON.stringify(local.audits, null, 2),
                    "수정이력.json",
                  )
                }
              >
                이력 다운로드
              </button>
            </div>
            {local.audits
              .slice()
              .reverse()
              .map((a, i) => (
                <details key={i} className="audit">
                  <summary>
                    {new Date(a.at).toLocaleString("ko-KR")} · {a.action}
                  </summary>
                  <pre>
                    {JSON.stringify(
                      { before: a.before, after: a.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ))}
          </section>
        )}
        <footer>
          우리 반 부동산 거래소{" "}
          <span>
            금액 단위: 권 · 실제 송금과 전세금 반환은 ClassBank에서 별도 처리
          </span>
        </footer>
      </main>
      {modal && (
        <div
          className="overlay"
          onClick={() => {
            setModal("");
            setError("");
          }}
        >
          <section
            className={"dialog " + (modal === "import" ? "large" : "")}
            role="dialog"
            aria-modal="true"
            aria-label="정보 관리"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>
                {
                  {
                    periodSnapshot: "기간 시작 현황 편집",
                    student: "학생 등록·수정",
                    property: "자리 등록·수정",
                    contract: "계약 등록·수정",
                    period: "새 거래 기간",
                    settings: "거래소 설정",
                    price: "시세 수정",
                    transfer: "파일 가져오기 · 내보내기",
                    import: "가져오기 변경 미리보기",
                  }[modal]
                }
              </h2>
              <button aria-label="닫기" onClick={() => setModal("")}>
                ✕
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal === "transfer" ? (
              <div className="form">
                <p>
                  현재 필터와 관계없이 학급 전체 자료를 내보냅니다. 공통
                  JSON에는 이미지가 포함되지 않습니다.
                </p>
                <button className="primary" onClick={exportJSON}>
                  ClassBank 공통 JSON 내보내기
                </button>
                <label className="button">
                  공통 JSON 가져오기
                  <input
                    hidden
                    type="file"
                    accept=".json"
                    onChange={(e) => fileImport(e.target.files?.[0])}
                  />
                </label>
                <label>
                  CSV 자료 종류
                  <select
                    value={csvKind}
                    onChange={(e) => setCsvKind(e.target.value as Collection)}
                  >
                    {collections.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    download(
                      csvExport(d, csvKind),
                      csvKind + ".csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  CSV 내보내기
                </button>
                <label className="button">
                  CSV 가져오기
                  <input
                    hidden
                    type="file"
                    accept=".csv"
                    onChange={(e) => fileImport(e.target.files?.[0], true)}
                  />
                </label>
                <button
                  onClick={() => {
                    const backup = {
                      backupFormat: "classroom-property-local-v1",
                      state: local,
                    };
                    download(JSON.stringify(backup), "전체백업.json");
                  }}
                >
                  이미지·설정·이력 포함 전체 백업
                </button>
                <label className="button">
                  전체 백업 복원
                  <input
                    hidden
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      try {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const b = JSON.parse(await file.text());
                        if (b.backupFormat !== "classroom-property-local-v1")
                          throw Error("전체 백업 형식이 아닙니다");
                        validateExchange(b.state.data);
                        assertBusiness(b.state.data);
                        if (
                          typeof b.state.image !== "string" &&
                          b.state.image !== null
                        )
                          throw Error("이미지 형식 오류");
                        if (
                          b.state.image &&
                          !/^data:image\/(png|jpeg|webp);base64,/.test(
                            b.state.image,
                          )
                        )
                          throw Error("이미지 형식 오류");
                        if (
                          !window.confirm(
                            "현재 전체 자료를 백업한 뒤 선택한 파일로 복원할까요?",
                          )
                        )
                          return;
                        await commit(
                          b.state.data,
                          "전체 백업 복원",
                          {
                            image: b.state.image,
                            settings: {
                              ...local.settings,
                              ...b.state.settings,
                            },
                            periodViews: b.state.periodViews ?? {},
                            audits: Array.isArray(b.state.audits)
                              ? b.state.audits
                              : [],
                          },
                          true,
                        );
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  />
                </label>
                <button
                  onClick={async () => {
                    try {
                      const b = await lastBackup();
                      if (!b) throw Error("자동 백업이 없습니다");
                      download(
                        JSON.stringify({
                          backupFormat: "classroom-property-local-v1",
                          state: b,
                        }),
                        "가져오기전_자동백업.json",
                      );
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  최근 가져오기 전 자동 백업 다운로드
                </button>
                <small>
                  CSV 빈 칸은 기존 값을 보존합니다. 명시적으로 비우려면 null을
                  사용하세요. ID 열은 변경하지 마세요.
                </small>
              </div>
            ) : modal === "import" ? (
              <div className="form">
                <p>
                  신규 {diffs?.filter((x) => x.kind === "new").length} · 변경
                  없음 {diffs?.filter((x) => x.kind === "same").length} · 충돌{" "}
                  {diffs?.filter((x) => x.kind === "conflict").length}
                </p>
                <p>
                  공통 이전 버전이 확인되지 않은 수정은 모두 충돌로 처리합니다.
                  소유권·계약·거래기록은 서로 일치하도록 함께 선택하세요.
                </p>
                <div className="diff-list">
                  {diffs?.map((v, i) => (
                    <details key={v.key + v.id}>
                      <summary>
                        {v.key} · {v.id.slice(0, 12)} ·{" "}
                        {v.kind === "new"
                          ? "신규"
                          : v.kind === "same"
                            ? "변경 없음"
                            : "충돌 / 수정"}
                      </summary>
                      <div className="diff-values">
                        <pre>현재{JSON.stringify(v.local, null, 2)}</pre>
                        <pre>
                          가져온 값{JSON.stringify(v.incoming, null, 2)}
                        </pre>
                      </div>
                      <select
                        aria-label="충돌 해결"
                        value={v.choice}
                        onChange={(e) =>
                          setDiffs((a) =>
                            a?.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    choice: e.target
                                      .value as Difference["choice"],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="keep">현재 데이터 유지</option>
                        <option value="incoming">가져온 데이터 적용</option>
                        <option value="skip">항목 건너뛰기</option>
                      </select>
                    </details>
                  ))}
                </div>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={async () => {
                    try {
                      const next = merge(d, diffs ?? []);
                      if (await commit(next, "파일 가져오기", {}, true))
                        setModal("");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  선택한 변경 승인 및 저장
                </button>
              </div>
            ) : (
              <form className="form" onSubmit={formSubmit}>
                {modal === "periodSnapshot" && (
                  <>
                    <p>
                      이 기간의 기준 현황만 설정합니다. 실제 계약과 현재
                      소유권은 그대로 유지됩니다.
                    </p>
                    {d.properties.map((q) => (
                      <div key={q.id}>
                        <label className="check">
                          <input
                            type="checkbox"
                            name={"include-" + q.id}
                            defaultChecked={local.periodViews[
                              period
                            ]?.properties.some((s) => s.id === q.id)}
                          />
                          {q.seatNumber}번 자리 포함
                        </label>
                        <label>
                          기준 소유자
                          <select
                            name={"owner-" + q.id}
                            defaultValue={
                              local.periodViews[period]?.properties.find(
                                (s) => s.id === q.id,
                              )?.ownerId ?? ""
                            }
                          >
                            {options}
                          </select>
                        </label>
                      </div>
                    ))}
                  </>
                )}
                {modal === "student" && (
                  <label>
                    학생 이름
                    <input
                      name="name"
                      required
                      defaultValue={
                        d.students.find((s) => s.id === studentId)?.name
                      }
                    />
                    <small>동명이인도 고유 ID로 구분합니다.</small>
                  </label>
                )}
                {modal === "property" && (
                  <>
                    <label>
                      자리번호
                      <input
                        name="seat"
                        required
                        defaultValue={p?.seatNumber}
                      />
                    </label>
                    <label>
                      최초 소유자
                      <select
                        name="owner"
                        defaultValue={p?.initialOwnerId ?? p?.ownerId ?? ""}
                        disabled={
                          !!p && d.contracts.some((c) => c.propertyId === p.id)
                        }
                      >
                        {options}
                      </select>
                      <small>
                        계약이 있는 자리의 소유권은 계약으로 변경합니다.
                      </small>
                    </label>
                    <label>
                      최초 낙찰가격
                      <input
                        name="auction"
                        type="number"
                        min="0"
                        step="any"
                        required
                        defaultValue={p?.auctionPrice ?? 0}
                      />
                    </label>
                    <label>
                      현재 시세
                      <input
                        name="market"
                        type="number"
                        min="0"
                        step="any"
                        required
                        defaultValue={p?.marketPrice ?? 0}
                      />
                    </label>
                  </>
                )}
                {modal === "contract" && (
                  <ContractFields
                    editing={editing}
                    owner={p ? stateAt(d, p).ownerId : null}
                    options={options}
                  />
                )}
                {modal === "price" && (
                  <label>
                    새 시세 (권)
                    <input
                      type="number"
                      name="price"
                      min="0"
                      step="any"
                      required
                      defaultValue={p?.marketPrice}
                    />
                    <small>최근 매매가격은 바뀌지 않습니다.</small>
                  </label>
                )}
                {modal === "period" && (
                  <>
                    <label>
                      기간 이름
                      <input name="label" placeholder="2026년 11월" required />
                    </label>
                    <label>
                      시작일
                      <input
                        name="start"
                        type="date"
                        required
                        defaultValue={today()}
                      />
                    </label>
                    <label>
                      종료일
                      <input
                        name="end"
                        type="date"
                        required
                        defaultValue={today()}
                      />
                    </label>
                    <label>
                      기간 시작 참고 현황
                      <select name="mode">
                        <option value="carry">
                          배치도와 소유 현황 이어서 사용
                        </option>
                        <option value="layout">
                          배치도만 복사 (소유 미지정)
                        </option>
                        <option value="empty">완전히 빈 현황</option>
                      </select>
                    </label>
                    <small>
                      이 선택은 기간 시작 스냅샷입니다. 실제 소유권과 계약은
                      유지됩니다. 초기화가 필요한 새 학급은 별도 브라우저
                      프로필을 사용하세요.
                    </small>
                  </>
                )}
                {modal === "settings" && (
                  <>
                    <label>
                      학급 ID
                      <input
                        name="classId"
                        required
                        defaultValue={d.classId}
                        readOnly={d.students.length + d.properties.length > 0}
                      />
                      <small>
                        처음 가져오기 전에 ClassBank의 학급 ID와 맞추세요.
                        자료가 생기면 변경할 수 없습니다.
                      </small>
                    </label>
                    {(["price", "owner", "status", "autoPrice"] as const).map(
                      (key, i) => (
                        <label className="check" key={key}>
                          <input
                            type="checkbox"
                            name={key}
                            defaultChecked={local.settings[key]}
                          />
                          {
                            [
                              "마커 시세 표시",
                              "마커 소유자 표시",
                              "마커 임대차 상태 표시",
                              "매매 등록·수정 시 시세 자동 반영",
                            ][i]
                          }
                        </label>
                      ),
                    )}
                  </>
                )}
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? "저장 중…" : "저장"}
                </button>
                {modal === "contract" && editing && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        download(
                          JSON.stringify(
                            {
                              ...d,
                              contracts: [editing],
                              transactions: d.transactions.filter(
                                (t) => t.contractId === editing.id,
                              ),
                            },
                            null,
                            2,
                          ),
                          "계약상세_열람용.json",
                        )
                      }
                    >
                      이 계약 열람용 내보내기
                    </button>
                    <small>
                      개별 계약 내보내기는 열람용입니다. 데이터 교환에는 전체
                      공통 JSON을 사용하세요.
                    </small>
                    {editing.status === "active" && (
                      <button
                        type="button"
                        onClick={() => changeStatus(editing, "ended")}
                      >
                        계약 종료
                      </button>
                    )}
                    {editing.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => changeStatus(editing, "cancelled")}
                      >
                        계약 취소
                      </button>
                    )}
                  </>
                )}
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function ContractFields({
  editing,
  owner,
  options,
}: {
  editing?: Contract;
  owner: string | null;
  options: React.ReactNode;
}) {
  const [type, setType] = useState(editing?.type ?? "sale");
  return (
    <>
      <label>
        계약 종류
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as Contract["type"])}
          disabled={!!editing}
        >
          <option value="sale">매매</option>
          <option value="jeonse">전세</option>
          <option value="rent">월세</option>
        </select>
        {editing && <input type="hidden" name="type" value={type} />}
      </label>
      <div className="form-row">
        <label>
          {type === "sale" ? "매도인" : "임대인"}
          <select
            name="from"
            defaultValue={
              editing?.sellerId ?? editing?.landlordId ?? owner ?? ""
            }
            required={type !== "sale"}
          >
            {options}
          </select>
        </label>
        <label>
          {type === "sale" ? "매수인" : "임차인"}
          <select
            name="to"
            defaultValue={editing?.buyerId ?? editing?.tenantId ?? ""}
            required
          >
            {options}
          </select>
        </label>
      </div>
      <label>
        {type === "sale"
          ? "총 매매대금"
          : type === "jeonse"
            ? "전세금"
            : "월세금"}{" "}
        (권)
        <input
          name="amount"
          type="number"
          min="0"
          step="any"
          required
          defaultValue={editing?.amount ?? 0}
        />
      </label>
      <label>
        계약일
        <input
          type="date"
          name="date"
          required
          defaultValue={editing?.contractDate ?? today()}
        />
      </label>
      {type !== "sale" && (
        <div className="form-row">
          <label>
            시작일
            <input
              name="start"
              type="date"
              required
              defaultValue={editing?.startDate ?? today()}
            />
          </label>
          <label>
            종료일
            <input
              name="end"
              type="date"
              required
              defaultValue={editing?.endDate ?? today()}
            />
          </label>
        </div>
      )}
      {type === "rent" && (
        <label>
          납부주기
          <input
            name="cycle"
            required
            defaultValue={editing?.paymentCycle ?? "매월"}
          />
        </label>
      )}
      <label>
        특약사항
        <textarea
          name="terms"
          rows={3}
          defaultValue={editing?.terms}
          placeholder="전세금 반환 규칙, 납부일 등을 기록하세요."
        />
      </label>
      <small>
        임대 종료일은 사용일에 포함됩니다. 자동송금·자동환급은 하지 않습니다.
      </small>
    </>
  );
}
function PriceChart({ values }: { values: number[] }) {
  if (!values.length) return <small>시세 기록이 없습니다.</small>;
  const max = Math.max(1, ...values),
    min = Math.min(...values);
  const points = values
    .map(
      (v, i) =>
        `${10 + (i * 260) / Math.max(1, values.length - 1)},${70 - ((v - min) / Math.max(1, max - min)) * 55}`,
    )
    .join(" ");
  return (
    <>
      <svg
        viewBox="0 0 280 85"
        role="img"
        aria-label={"시세 변화: " + values.join(", ")}
      >
        <path d="M10 75 H270" stroke="#dce5de" />
        <polyline
          points={points}
          fill="none"
          stroke="#367661"
          strokeWidth="3"
        />
        {values.length === 1 && <circle cx="10" cy="70" r="3" fill="#367661" />}
      </svg>
      <small>
        {num(values[0])}권 → {num(values.at(-1))}권
      </small>
    </>
  );
}
