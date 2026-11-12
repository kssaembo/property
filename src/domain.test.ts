import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  emptyExchange,
  validateExchange,
  serializeExchange,
  type Contract,
  type Exchange,
} from "../shared/exchange";
import {
  saveContract,
  stateAt,
  setPrice,
  stats,
  clone,
  assertBusiness,
} from "./domain";
import { preview, merge, csvImport, csvExport } from "./transfer";
import { readState, writeState, lastBackup, type LocalState } from "./storage";
const DAY = "2025-01-10";
function fixture() {
  const d = emptyExchange("test-class");
  d.students = [
    { id: "a", name: "동명이인" },
    { id: "b", name: "동명이인" },
    { id: "c", name: "세번째" },
  ];
  d.properties = [
    {
      id: "p",
      seatNumber: "1",
      ownerId: "a",
      occupantId: "a",
      initialOwnerId: "a",
      initialSalePrice: null,
      marketPrice: 150,
      auctionPrice: 100,
      latestSalePrice: null,
      position: { x: 0.3, y: 0.7 },
      revision: 1,
    },
  ];
  return d;
}
function contract(patch: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    propertyId: "p",
    type: "sale",
    sellerId: "a",
    buyerId: "b",
    landlordId: null,
    tenantId: null,
    amount: 120,
    paymentCycle: null,
    contractDate: DAY,
    startDate: DAY,
    endDate: null,
    terms: "",
    status: "active",
    revision: 1,
    ...patch,
  };
}
function lease(patch: Partial<Contract> = {}): Contract {
  return contract({
    type: "jeonse",
    sellerId: null,
    buyerId: null,
    landlordId: "a",
    tenantId: "b",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
    ...patch,
  });
}
describe("계약과 소유권", () => {
  it("매매는 소유권과 최근 거래가만 변경한다", () => {
    const d = saveContract(fixture(), contract());
    expect(stateAt(d, d.properties[0], DAY).ownerId).toBe("b");
    expect(d.properties[0].latestSalePrice).toBe(120);
    expect(d.properties[0].marketPrice).toBe(150);
  });
  it("전세는 소유권을 보존하고 임차인을 표시한다", () => {
    const d = saveContract(fixture(), lease());
    expect(stateAt(d, d.properties[0], DAY)).toMatchObject({
      ownerId: "a",
      occupantId: "b",
    });
  });
  it("월세 납부주기를 보존한다", () => {
    const d = saveContract(
      fixture(),
      lease({ type: "rent", paymentCycle: "매주" }),
    );
    expect(d.contracts[0].paymentCycle).toBe("매주");
  });
  it("월세 납부주기 누락을 거절한다", () =>
    expect(() => saveContract(fixture(), lease({ type: "rent" }))).toThrow());
  it("임차인 수정과 거래 ID 불변", () => {
    const a = saveContract(fixture(), lease());
    const b = saveContract(a, { ...a.contracts[0], tenantId: "c", amount: 90 });
    expect(b.transactions).toHaveLength(1);
    expect(b.transactions[0].id).toBe(a.transactions[0].id);
    expect(b.transactions[0].amount).toBe(90);
    expect(stateAt(b, b.properties[0], DAY).occupantId).toBe("c");
  });
  it("계약 종료일 다음날 사용자 복원", () => {
    let d = saveContract(fixture(), lease());
    d = saveContract(d, {
      ...d.contracts[0],
      status: "ended",
      endedAt: "2025-01-15",
    });
    expect(stateAt(d, d.properties[0], "2025-01-15").occupantId).toBe("b");
    expect(stateAt(d, d.properties[0], "2025-01-16").occupantId).toBe("a");
    expect(d.transactions).toHaveLength(1);
  });
  it("자연 만료 후 사용자를 복원", () => {
    const d = saveContract(fixture(), lease());
    expect(stateAt(d, d.properties[0], "2025-02-01").occupantId).toBe("a");
  });
  it("매매 취소는 이전 소유권을 복원한다", () => {
    let d = saveContract(fixture(), contract());
    d = saveContract(d, { ...d.contracts[0], status: "cancelled" });
    expect(d.properties[0].ownerId).toBe("a");
    expect(d.contracts).toHaveLength(1);
    expect(d.transactions).toHaveLength(1);
    expect(stats(d).count).toBe(0);
  });
  it("매매 종료는 소유권을 되돌리지 않는다", () => {
    let d = saveContract(fixture(), contract());
    d = saveContract(d, { ...d.contracts[0], status: "ended" });
    expect(d.properties[0].ownerId).toBe("b");
  });
  it("후속 매매가 있는 이전 매매 취소를 거절한다", () => {
    let d = saveContract(fixture(), contract());
    d = saveContract(
      d,
      contract({
        id: "c2",
        sellerId: "b",
        buyerId: "c",
        contractDate: "2025-02-01",
        startDate: "2025-02-01",
      }),
    );
    expect(() =>
      saveContract(d, { ...d.contracts[0], status: "cancelled" }),
    ).toThrow("소유권");
  });
  it("겹치는 임대차를 거절한다 (종료일 포함)", () => {
    const d = saveContract(fixture(), lease());
    expect(() =>
      saveContract(
        d,
        lease({
          id: "c2",
          tenantId: "c",
          startDate: "2025-01-31",
          endDate: "2025-02-03",
        }),
      ),
    ).toThrow("겹칩니다");
  });
  it("임대차 중 매매를 차단한다", () => {
    const d = saveContract(fixture(), lease());
    expect(() => saveContract(d, contract({ id: "c2" }))).toThrow();
  });
  it("매매 후 기존 소유자가 예약한 임대차를 차단한다", () => {
    const d = saveContract(
      fixture(),
      lease({ startDate: "2025-02-01", endDate: "2025-02-28" }),
    );
    expect(() => saveContract(d, contract({ id: "c2" }))).toThrow("임대인");
  });
  it("임대차 종료 이후 매매를 허용한다", () => {
    let d = saveContract(fixture(), lease());
    d = saveContract(d, {
      ...d.contracts[0],
      status: "ended",
      endedAt: "2025-01-09",
    });
    d = saveContract(d, contract({ id: "c2" }));
    expect(d.properties[0].ownerId).toBe("b");
  });
  it("계약 종류 또는 자리 변경을 거절한다", () => {
    const d = saveContract(fixture(), contract());
    expect(() => saveContract(d, { ...d.contracts[0], type: "rent" })).toThrow(
      "변경할 수 없습니다",
    );
  });
  it("음수 가격과 잘못된 날짜를 거절한다", () => {
    expect(() => saveContract(fixture(), contract({ amount: -1 }))).toThrow();
    expect(() =>
      saveContract(fixture(), contract({ contractDate: "2025-02-30" })),
    ).toThrow();
  });
  it("시세 변경 이력을 남긴다", () => {
    const d = setPrice(fixture(), "p", 180);
    expect(d.marketHistory[0].price).toBe(180);
    expect(d.properties[0].latestSalePrice).toBeNull();
  });
  it("같은 날짜 중복 매매를 차단한다", () => {
    const d = saveContract(fixture(), contract());
    expect(() =>
      saveContract(d, contract({ id: "c2", sellerId: "b", buyerId: "c" })),
    ).toThrow();
  });
  it("통계는 기간과 취소 상태를 반영한다", () => {
    const d = saveContract(fixture(), contract());
    expect(stats(d, "2025-02-01", "2025-02-28").count).toBe(0);
    expect(stats(d).averageSale).toBe(120);
  });
});
describe("교환·검증·CSV", () => {
  it("JSON 왕복 시 모든 ID 보존", () => {
    const d = saveContract(fixture(), contract());
    const n = validateExchange(JSON.parse(serializeExchange(d)));
    expect(n.properties).toEqual(d.properties);
    expect(n.contracts).toEqual(d.contracts);
    expect(n.transactions).toEqual(d.transactions);
  });
  it("동일 파일 반복 가져오기가 멱등적", () => {
    const d = saveContract(fixture(), contract());
    const n = merge(d, preview(d, d));
    expect(merge(n, preview(n, d))).toEqual(d);
  });
  it("내보내기 후 필드 순서가 달라져도 변경 없음", () => {
    const d = saveContract(fixture(), contract());
    expect(
      preview(d, JSON.parse(serializeExchange(d))).every(
        (v) => v.kind === "same",
      ),
    ).toBe(true);
  });
  it("다른 학급은 거절", () =>
    expect(() => preview(fixture(), emptyExchange("other"))).toThrow(
      "학급 ID",
    ));
  it("같은 revision의 다른 값도 충돌", () => {
    const a = fixture(),
      b = clone(a);
    b.properties[0].marketPrice = 120;
    expect(preview(a, b).find((v) => v.key === "properties")?.kind).toBe(
      "conflict",
    );
    expect(merge(a, preview(a, b)).properties[0].marketPrice).toBe(150);
  });
  it("충돌을 명시적으로 선택하면 적용", () => {
    const a = fixture(),
      b = clone(a);
    b.properties[0].marketPrice = 120;
    const diffs = preview(a, b);
    diffs.forEach((v) => (v.choice = "incoming"));
    expect(merge(a, diffs).properties[0].marketPrice).toBe(120);
  });
  it("알 수 없는 참조·중복 ID·중복 거래를 차단", () => {
    let d = fixture();
    d.properties[0].ownerId = "absent";
    expect(() => validateExchange(d)).toThrow();
    d = fixture();
    d.students.push(d.students[0]);
    expect(() => validateExchange(d)).toThrow("중복 ID");
    d = saveContract(fixture(), contract());
    d.transactions.push({ ...d.transactions[0], id: "duplicate" });
    expect(() => validateExchange(d)).toThrow("하나만");
  });
  it("자리와 계약을 따로 적용해 소유권이 어긋나면 거절", () => {
    const a = fixture(),
      b = saveContract(a, contract());
    const diffs = preview(a, b);
    expect(() => merge(a, diffs)).toThrow("불일치");
  });
  it("좌표 범위 검증", () => {
    const d = fixture();
    d.properties[0].position!.x = 1.1;
    expect(() => validateExchange(d)).toThrow();
  });
  it("CSV 왕복 좌표와 숫자 보존", () => {
    const d = fixture();
    expect(
      csvImport(d, "properties", csvExport(d, "properties")).properties,
    ).toEqual(d.properties);
  });
  it("부분 CSV는 기존 필드 보존", () => {
    const d = csvImport(fixture(), "properties", "id,marketPrice\np,200");
    expect(d.properties[0].ownerId).toBe("a");
    expect(d.properties[0].marketPrice).toBe(200);
  });
  it("CSV의 줄바꿈·쉼표·따옴표 이름", () => {
    const d = fixture();
    d.students[0].name = '이름,"A"\nB';
    expect(csvImport(d, "students", csvExport(d, "students")).students).toEqual(
      d.students,
    );
  });
  it("계약 CSV 등록은 연관 소유권과 거래기록을 미리보기 데이터에 반영", () => {
    const source = saveContract(fixture(), contract());
    const next = csvImport(
      fixture(),
      "contracts",
      csvExport(source, "contracts"),
    );
    expect(next.properties[0].ownerId).toBe("b");
    expect(next.transactions).toHaveLength(1);
    expect(csvImport(next, "contracts", csvExport(next, "contracts"))).toEqual(
      next,
    );
  });
  it("CSV 중복 ID와 잘못된 금액을 거절", () => {
    expect(() =>
      csvImport(fixture(), "properties", "id,marketPrice\np,1\np,2"),
    ).toThrow();
    expect(() =>
      csvImport(fixture(), "properties", "id,marketPrice\np,NaN"),
    ).toThrow();
  });
  it("CSV 수식 주입을 완화", () => {
    const d = fixture();
    d.students[0].name = "=SUM(1,2)";
    expect(csvExport(d, "students")).toContain("'=SUM");
  });
  it("원본은 실패 시 변하지 않는다", () => {
    const d = fixture(),
      before = clone(d);
    expect(() => saveContract(d, contract({ sellerId: "c" }))).toThrow();
    expect(d).toEqual(before);
  });
  it("기간 생성은 계약과 좌표를 변경하지 않는다", () => {
    const d = saveContract(fixture(), lease());
    const old = clone(d.contracts);
    d.periods.push({
      id: "per",
      label: "다음 달",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    assertBusiness(d);
    expect(d.contracts).toEqual(old);
    expect(d.properties[0].position).toEqual({ x: 0.3, y: 0.7 });
  });
  it("공통 예시의 sellerId null인 최초 매매 지원", () => {
    const d = fixture();
    d.properties[0].ownerId = null;
    d.properties[0].occupantId = null;
    delete d.properties[0].initialOwnerId;
    const n = saveContract(d, contract({ sellerId: null }));
    expect(n.properties[0].ownerId).toBe("b");
  });
});
describe("IndexedDB 원자성", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase("classroom-property-v1");
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  const state = (): LocalState => ({
    data: fixture(),
    image: "data:image/png;base64,test",
    settings: { price: true, owner: true, status: true, autoPrice: false },
    audits: [],
    sequence: 1,
    periodViews: {},
  });
  it("다시 읽어도 자료·이미지·좌표 유지", async () => {
    const s = state();
    await writeState(s);
    expect(await readState()).toEqual(s);
  });
  it("가져오기 전 백업과 자료를 함께 저장", async () => {
    const s = state();
    await writeState(s);
    await writeState(
      { ...s, sequence: 2, data: setPrice(s.data, "p", 300) },
      true,
    );
    expect((await lastBackup())?.data.properties[0].marketPrice).toBe(150);
    expect((await readState())?.data.properties[0].marketPrice).toBe(300);
  });
  it("다른 탭의 오래된 쓰기를 차단", async () => {
    const s = state();
    await writeState(s);
    await expect(writeState(s)).rejects.toThrow("다른 탭");
    expect(await readState()).toEqual(s);
  });
});
