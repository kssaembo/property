import {
  type Exchange,
  type Contract,
  type Property,
  validateExchange,
  today,
  uid,
} from "../shared/exchange";
export const clone = <T>(v: T): T => structuredClone(v);
export function stateAt(d: Exchange, p: Property, on = today()) {
  const sales = d.contracts
    .filter((c) => c.propertyId === p.id && c.type === "sale")
    .sort(
      (a, b) =>
        a.contractDate.localeCompare(b.contractDate) ||
        a.id.localeCompare(b.id),
    );
  let owner =
    p.initialOwnerId !== undefined
      ? p.initialOwnerId
      : sales.length
        ? sales[0].sellerId
        : p.ownerId;
  let latest =
    p.initialSalePrice !== undefined
      ? p.initialSalePrice
      : sales.length
        ? null
        : p.latestSalePrice;
  for (const c of sales.filter(
    (c) => c.status !== "cancelled" && c.contractDate <= on,
  )) {
    if (c.sellerId !== owner)
      throw Error(
        "이후 매매와 소유권 연결이 끊어집니다. 이후 계약부터 취소·수정하세요.",
      );
    owner = c.buyerId;
    latest = c.amount;
  }
  const lease = d.contracts.find(
    (c) =>
      c.propertyId === p.id &&
      c.type !== "sale" &&
      c.status !== "cancelled" &&
      c.startDate <= on &&
      (c.endedAt ?? c.endDate!) >= on,
  );
  return {
    ownerId: owner,
    occupantId: lease?.tenantId ?? owner,
    latestSalePrice: latest,
    lease,
  };
}
export function assertBusiness(d: Exchange) {
  validateExchange(d);
  for (const p of d.properties) {
    stateAt(d, p);
    const sales = d.contracts.filter(
      (c) =>
        c.propertyId === p.id && c.type === "sale" && c.status !== "cancelled",
    );
    const dates = new Set();
    for (const s of sales) {
      if (dates.has(s.contractDate))
        throw Error("같은 자리의 하루 두 번 매매는 지원하지 않습니다");
      dates.add(s.contractDate);
      if (s.contractDate > today())
        throw Error("미래 매매는 등록할 수 없습니다");
    }
    for (const l of d.contracts.filter(
      (c) =>
        c.propertyId === p.id && c.type !== "sale" && c.status !== "cancelled",
    )) {
      if (stateAt(d, p, l.startDate).ownerId !== l.landlordId)
        throw Error("임대인이 계약 시작일의 소유자와 다릅니다");
      if (
        sales.some(
          (s) =>
            s.contractDate >= l.startDate &&
            s.contractDate <= (l.endedAt ?? l.endDate!),
        )
      )
        throw Error(
          "임대차 기간 중 매매는 불가합니다. 임대차를 먼저 종료하세요.",
        );
    }
  }
}
export function refresh(d: Exchange) {
  for (const p of d.properties) {
    const s = stateAt(d, p);
    p.ownerId = s.ownerId;
    p.occupantId = s.occupantId;
    p.latestSalePrice = s.latestSalePrice;
  }
  return d;
}
export function saveContract(original: Exchange, input: Contract) {
  const d = clone(original);
  const old = d.contracts.find((c) => c.id === input.id);
  if (old && (old.propertyId !== input.propertyId || old.type !== input.type))
    throw Error("계약의 자리·종류·ID는 변경할 수 없습니다");
  const p = d.properties.find((p) => p.id === input.propertyId);
  if (!p) throw Error("자리를 찾을 수 없습니다");
  if (p.initialOwnerId === undefined) {
    const first = d.contracts
      .filter((c) => c.propertyId === p.id && c.type === "sale")
      .sort((a, b) => a.contractDate.localeCompare(b.contractDate))[0];
    p.initialOwnerId = first ? first.sellerId : p.ownerId;
    p.initialSalePrice = first ? null : p.latestSalePrice;
  }
  const c = {
    ...input,
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (old) d.contracts[d.contracts.indexOf(old)] = c;
  else d.contracts.push(c);
  const tx = d.transactions.find((t) => t.contractId === c.id);
  const t = {
    id: tx?.id ?? uid(),
    contractId: c.id,
    propertyId: c.propertyId,
    type: c.type,
    amount: c.amount,
    date: c.contractDate,
    revision: (tx?.revision ?? 0) + 1,
    updatedAt: c.updatedAt,
  };
  if (tx) d.transactions[d.transactions.indexOf(tx)] = t;
  else d.transactions.push(t);
  assertBusiness(d);
  refresh(d);
  p.revision++;
  p.updatedAt = c.updatedAt;
  return d;
}
export function setPrice(
  original: Exchange,
  propertyId: string,
  price: number,
) {
  const d = clone(original);
  const p = d.properties.find((p) => p.id === propertyId)!;
  p.marketPrice = price;
  p.revision++;
  p.updatedAt = new Date().toISOString();
  d.marketHistory.push({
    id: uid(),
    propertyId,
    price,
    recordedAt: p.updatedAt,
  });
  return validateExchange(d);
}
export function stats(d: Exchange, start = "0000-01-01", end = "9999-12-31") {
  const cs = d.contracts.filter(
    (c) =>
      c.status !== "cancelled" &&
      c.contractDate >= start &&
      c.contractDate <= end,
  );
  const sales = cs.filter((c) => c.type === "sale");
  const amounts = sales.map((c) => c.amount);
  return {
    seats: d.properties.length,
    sold: new Set(sales.map((c) => c.propertyId)).size,
    jeonse: cs.filter((c) => c.type === "jeonse").length,
    rent: cs.filter((c) => c.type === "rent").length,
    leased: d.properties.filter((p) => stateAt(d, p).lease).length,
    count: cs.length,
    averageSale: amounts.length
      ? amounts.reduce((a, b) => a + b, 0) / amounts.length
      : 0,
    max: Math.max(0, ...amounts),
    min: amounts.length ? Math.min(...amounts) : 0,
    averageMarket: d.properties.length
      ? d.properties.reduce((a, p) => a + p.marketPrice, 0) /
        d.properties.length
      : 0,
  };
}
