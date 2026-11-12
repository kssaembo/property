import { describe, it, expect } from "vitest";
import { classroomSlots } from "./classroom-layout";
import type { Property } from "../shared/exchange";
const property = (id: string, n: string): Property => ({
  id,
  seatNumber: n,
  ownerId: null,
  occupantId: null,
  auctionPrice: 0,
  marketPrice: 0,
  latestSalePrice: null,
  revision: 1,
  position: null,
});
describe("참고 이미지 교실 배치", () => {
  it("기본 27석, 앞쪽 모둠 4석씩 뒤쪽 5석씩", () => {
    const s = classroomSlots([]);
    expect(s).toHaveLength(27);
    expect(
      Array.from(
        { length: 6 },
        (_, i) => s.filter((s) => s.group === i).length,
      ),
    ).toEqual([4, 4, 4, 5, 5, 5]);
  });
  it("뒤쪽 맨 윗줄은 각 모둠의 오른쪽 자리뿐이다", () => {
    const s = classroomSlots([]),
      top = s.filter((slot) => slot.y === Math.min(...s.map((item) => item.y)));
    expect(top).toHaveLength(3);
    expect(top.map((s) => s.x)).toEqual([300, 625, 950]);
    expect(top.map((s) => s.group)).toEqual([5, 4, 3]);
  });
  it("앞쪽 왼쪽부터 모둠 3,2,1이다", () => {
    const s = classroomSlots([]).filter((s) => s.y === 494);
    expect(s.map((s) => s.group)).toEqual([2, 2, 1, 1, 0, 0]);
  });
  it("시각적 빈 자리는 실제 소유 데이터가 아니다", () => {
    expect(classroomSlots([]).every((s) => !s.property)).toBe(true);
  });
  it("기존 자리 ID와 계약 연결을 변경하지 않는다", () => {
    const p = property("external-id", "1");
    expect(classroomSlots([p])[0].property).toBe(p);
    expect(p.id).toBe("external-id");
  });
  it("숫자가 아닌 외부 자리번호도 누락하지 않는다", () => {
    const p = property("external-id", "창가");
    expect(
      classroomSlots([p]).filter((s) => s.property?.id === p.id),
    ).toHaveLength(1);
  });
  it("27개를 넘는 기존 자료도 보존한다", () => {
    const ps = Array.from({ length: 32 }, (_, i) =>
      property("id-" + i, String(i + 1)),
    );
    expect(classroomSlots(ps).filter((s) => s.property)).toHaveLength(32);
    expect(new Set(classroomSlots(ps).map((s) => s.number)).size).toBe(32);
  });
});
