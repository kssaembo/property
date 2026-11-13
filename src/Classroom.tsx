import LivingClassroom from "./LivingClassroom";
import { visualY } from "./life";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Exchange, Property } from "../shared/exchange";
import { stateAt } from "./domain";
import {
  classroomSlots,
  groupDefaults,
  type DeskSlot,
} from "./classroom-layout";
import type { LocalState } from "./storage";
const localDate = (value: string) =>
  new Date(value).toLocaleDateString("ko-KR");
const fmt = (n: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(n);
const colors = [
  "#65bfa3",
  "#efb66c",
  "#7ab5df",
  "#ac9ad7",
  "#e99fa7",
  "#7cbb9b",
];
export function MarketGraph({
  data,
  property,
}: {
  data: Exchange;
  property: Property;
}) {
  const history = data.marketHistory
    .filter((h) => h.propertyId === property.id)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (!history.length)
    return <div className="graph-empty">시세 변경 후 그래프가 그려져요.</div>;
  const vals = history.map((h) => h.price),
    low = Math.min(...vals),
    high = Math.max(...vals),
    range = Math.max(1, high - low);
  const pts = vals.map((v, i) => ({
    x: 15 + (i * 250) / Math.max(1, vals.length - 1),
    y: 75 - ((v - low) / range) * 53,
  }));
  return (
    <div className="market-graph">
      <div>
        <span>시세 변화</span>
        <b>{fmt(vals.at(-1)!)}권</b>
      </div>
      <svg
        viewBox="0 0 280 100"
        aria-label={
          "시세 이력 " +
          history
            .map((h) => `${localDate(h.recordedAt)} ${h.price}권`)
            .join(", ")
        }
        role="img"
      >
        <path
          d="M15 25H265 M15 50H265 M15 75H265"
          stroke="#e4e9e4"
          strokeDasharray="3 4"
        />
        <path
          d={`M${pts.map((p) => `${p.x},${p.y}`).join(" L")} L265,80 L15,80Z`}
          fill="#63b69822"
        />
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#358c73"
          strokeWidth="3"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#358c73">
            <title>
              {localDate(history[i].recordedAt)} · {vals[i]}권
            </title>
          </circle>
        ))}
      </svg>
      <small>
        {localDate(history[0].recordedAt)}
        <span>{localDate(history.at(-1)!.recordedAt)}</span>
      </small>
    </div>
  );
}
export function SeatFacts({
  data,
  property,
  readOnly = false,
}: {
  data: Exchange;
  property: Property;
  readOnly?: boolean;
}) {
  const s = stateAt(data, property),
    name = (id: string | null) =>
      data.students.find((x) => x.id === id)?.name ?? "미지정";
  return (
    <>
      <dl className="seat-facts">
        <dt>소유주</dt>
        <dd>{name(s.ownerId)}</dd>
        <dt>임대인</dt>
        <dd>{s.lease ? name(s.lease.landlordId) : "—"}</dd>
        <dt>임차인</dt>
        <dd>{s.lease ? name(s.lease.tenantId) : "—"}</dd>
        <dt>현재 시세</dt>
        <dd>{fmt(property.marketPrice)}권</dd>
        {!readOnly && (
          <>
            <dt>최근 매매가</dt>
            <dd>
              {s.latestSalePrice === null ? "—" : fmt(s.latestSalePrice) + "권"}
            </dd>
            <dt>최초 낙찰가</dt>
            <dd>{fmt(property.auctionPrice)}권</dd>
          </>
        )}
      </dl>
      {!readOnly && s.lease && (
        <p className="lease-dates">
          {s.lease.type === "rent" ? "월세" : "전세"} {fmt(s.lease.amount)}권 ·{" "}
          {s.lease.startDate} ~ {s.lease.endedAt ?? s.lease.endDate}
        </p>
      )}
      <MarketGraph data={data} property={property} />
    </>
  );
}
export default function Classroom({
  local,
  onSeat,
  onGroup,
  readOnly = false,
}: {
  local: LocalState;
  readOnly?: boolean;
  onSeat: (slot: DeskSlot) => void;
  onGroup: (index: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const spread = 1; // Keep furniture and room proportions independent of viewport width.
  const [hover, setHover] = useState<DeskSlot>();
  const room = local.classroom;
  const data = local.data;
  const count = room?.seatCount ?? 27;
  const slots = classroomSlots(data.properties, count);
  const names = room?.groupNames ?? groupDefaults;
  const animated = room?.animated !== false;
  const height =
    data.properties.length > count
      ? 800 + Math.ceil((data.properties.length - count) / 8) * 82
      : 800;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(
        0.01,
        Math.min(
          entry.contentRect.width / 1200,
          entry.contentRect.height / height,
        ),
      );
      setScale(next);

    });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, [height]);
  const name = (id: string | null) =>
    data.students.find((s) => s.id === id)?.name ?? "미지정";
  return (
    <section
      className={"classroom-view " + (!animated ? "paused" : "")}
      aria-label="교실 자리배치도"
    >
      <div className="room-hud">
        <span>
          <i />
          우리 교실{" "}
          <small>
            등록 {data.properties.length} /{" "}
            {Math.max(count, data.properties.length)}석
          </small>
        </span>
        <span className="map-hint">
          {readOnly
            ? "읽기 전용 · 자리를 눌러 자세히"
            : "자리 클릭 · 계약 입력"}{" "}
          <b> / </b> 마우스 올리기 · 자세히
        </span>
        <span className="room-key">
          <i />
          소유주 사용 <i />
          임대 중
        </span>
      </div>
      <div className="room-viewport" ref={box}>
        <div
          className="room-stage"
          style={
            {
              height,
              width: 1200 * spread,
              "--spread": spread,
              transform: `translate(-50%,-50%) scale(${scale})`,
            } as CSSProperties
          }
        >
          <div className="illustrated-room" aria-hidden="true" />
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={"group-zone group-" + i}
              style={
                {
                  left: (145 + (2 - (i % 3)) * 325) * spread,
                  width: 278 * spread,
                  top: i < 3 ? 510 : 270,
                  height: i < 3 ? 180 : 235,
                  "--group-color": colors[i],
                } as CSSProperties
              }
            >
              <button
                className="group-name"
                disabled={readOnly}
                onClick={() => onGroup(i)}
                aria-label={`${names[i] ?? groupDefaults[i]} 이름 수정`}
              >
                <span>{i + 1}</span>
                {names[i] ?? groupDefaults[i]}
                <i>✎</i>
              </button>
            </div>
          ))}
          {slots.map((slot) => {
            const p = slot.property;
            const s = p ? stateAt(data, p) : undefined;
            return (
              <button
                key={p?.id ?? "slot-" + slot.number}
                className={
                  "desk " +
                  (p ? "occupied" : "vacant") +
                  (s?.lease ? " rented" : "")
                }
                style={
                  {
                    left: slot.x * spread,
                    width: 120 * spread,
                    top: visualY(slot.y),
                    zIndex: Math.round(visualY(slot.y) + 65),
                    "--group-color": colors[slot.group % 6],
                  } as CSSProperties
                }
                aria-label={`${slot.number}번 자리 ${readOnly ? "정보" : p ? "정보 및 계약" : "등록"}`}
                onClick={() => {
                  setHover(undefined);
                  onSeat(slot);
                }}
                onMouseEnter={() => setHover(slot)}
                onMouseLeave={() => setHover(undefined)}
                onFocus={() => setHover(slot)}
                onBlur={() => setHover(undefined)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setHover(undefined);
                }}
              >
                <span className="desk-art" />
                <span className="desk-top">
                  <span className="seat-no">
                    {slot.number.padStart(2, "0")}
                  </span>
                  {p ? (
                    <>
                      <span className="desk-owner">
                        <small>{s?.lease ? "소유·임대" : "소유"}</small>
                        {name(s!.ownerId)}
                      </span>
                      {s?.lease && (
                        <span className="desk-tenant">
                          <small>임차</small>
                          {name(s.lease.tenantId)}
                        </span>
                      )}
                      <b className="desk-price">
                        {fmt(p.marketPrice)}
                        <small>권</small>
                      </b>
                    </>
                  ) : (
                    <>
                      <span className="vacant-number">
                        {slot.number.padStart(2, "0")}
                      </span>
                      <span className="desk-invite">
                        {readOnly ? "미등록" : "클릭해서 등록"}
                      </span>
                    </>
                  )}
                  <i className="desk-pencil" />
                </span>
              </button>
            );
          })}
          <div className="chalkboard">
            <div>
              <span>우리 반 부동산 거래소</span>
              <small>나의 자리, 함께 만드는 우리 교실</small>
            </div>
            <i className="chalk" />
            <i className="eraser" />
          </div>
          <div className="teacher-desk">
            <span>출석부</span>
            <i>☕</i>
          </div>
          <LivingClassroom spread={spread} enabled={animated} />
        </div>
      </div>
      {hover && (
        <div
          className="seat-tooltip"
          role="tooltip"
          style={{
            left: `clamp(12px, ${hover.x > 600 ? "calc(50% - 360px)" : "calc(50% + 30px)"}, calc(100% - 318px))`,
          }}
        >
          <div className="tooltip-title">
            <b>{hover.number}번 자리</b>
            <span>
              {hover.property
                ? readOnly
                  ? "게시된 자리 정보"
                  : "클릭해서 관리"
                : "아직 등록 전이에요"}
            </span>
          </div>
          {hover.property ? (
            <SeatFacts
              data={data}
              property={hover.property}
              readOnly={readOnly}
            />
          ) : (
            <p>
              {readOnly
                ? "게시된 정보가 없는 자리입니다."
                : "이 책상을 클릭하면 소유주와 시세를 등록하고 매매·전세·월세 계약을 입력할 수 있어요."}
            </p>
          )}
        </div>
      )}
      <div className="room-bottom-note">
        {readOnly
          ? "게시 시점의 읽기 전용 현황입니다."
          : "모둠 이름을 누르면 수정할 수 있어요."}
        <span>캐릭터는 가상의 교실 친구들이에요.</span>
      </div>
    </section>
  );
}
