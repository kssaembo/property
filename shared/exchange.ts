import { z } from "zod";

export const id = z.string().trim().min(1).max(200);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "유효한 날짜가 아닙니다",
  );
const timestamp = z.iso.datetime({ offset: true });
const money = z.number().finite().nonnegative();
const meta = {
  updatedAt: timestamp.optional(),
  revision: z.number().int().positive(),
};
export const studentSchema = z.object({
  id,
  name: z.string().trim().min(1),
  updatedAt: timestamp.optional(),
  revision: z.number().int().positive().optional(),
});
export const propertySchema = z.object({
  id,
  seatNumber: z.string().trim().min(1),
  ownerId: id.nullable(),
  occupantId: id.nullable(),
  auctionPrice: money,
  latestSalePrice: money.nullable(),
  marketPrice: money,
  position: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .nullable(),
  ...meta,
  initialOwnerId: id.nullable().optional(),
  initialSalePrice: money.nullable().optional(),
});
export const contractSchema = z
  .object({
    id,
    propertyId: id,
    type: z.enum(["sale", "jeonse", "rent"]),
    buyerId: id.nullable(),
    sellerId: id.nullable(),
    landlordId: id.nullable(),
    tenantId: id.nullable(),
    amount: money,
    paymentCycle: z.string().nullable(),
    contractDate: date,
    startDate: date,
    endDate: date.nullable(),
    terms: z.string(),
    status: z.enum(["active", "ended", "cancelled"]),
    ...meta,
    endedAt: date.optional(),
  })
  .superRefine((v, c) => {
    const issue = (message: string) => c.addIssue({ code: "custom", message });
    if (v.type === "sale") {
      if (!v.buyerId || v.buyerId === v.sellerId)
        issue("매수인과 매도인을 확인하세요");
      if (v.landlordId || v.tenantId || v.endDate || v.paymentCycle)
        issue("매매 계약의 임대차 필드는 비워야 합니다");
      if (v.startDate !== v.contractDate)
        issue("매매 시작일과 계약일이 달라요");
    } else {
      if (!v.landlordId || !v.tenantId || v.landlordId === v.tenantId)
        issue("임대인과 임차인을 확인하세요");
      if (v.buyerId || v.sellerId) issue("임대차의 매매 필드는 비워야 합니다");
      if (!v.endDate || v.endDate < v.startDate) issue("종료일을 확인하세요");
      if (v.type === "rent" && !v.paymentCycle?.trim())
        issue("납부주기를 입력하세요");
    }
    if (
      v.endedAt &&
      (v.endedAt < v.startDate || (v.endDate && v.endedAt > v.endDate))
    )
      issue("실제 종료일이 계약 기간 밖입니다");
    if (v.type !== "sale" && v.status === "ended" && !v.endedAt)
      issue("종료된 임대차에는 endedAt이 필요합니다");
  });
export const transactionSchema = z.object({
  id,
  contractId: id,
  propertyId: id,
  type: z.enum(["sale", "jeonse", "rent"]),
  amount: money,
  date,
  ...meta,
});
export const marketSchema = z.object({
  id,
  propertyId: id,
  price: money,
  recordedAt: timestamp,
});
export const periodSchema = z
  .object({
    id,
    label: z.string().trim().min(1),
    startDate: date,
    endDate: date,
  })
  .refine((v) => v.endDate >= v.startDate, "기간 순서를 확인하세요");
export const exchangeSchema = z.object({
  format: z.literal("classbank-property-exchange"),
  schemaVersion: z.literal("1.0.0"),
  classId: id,
  exportId: id,
  exportedAt: timestamp,
  source: z.enum(["classbank", "property-service"]),
  students: z.array(studentSchema),
  properties: z.array(propertySchema),
  contracts: z.array(contractSchema),
  transactions: z.array(transactionSchema),
  marketHistory: z.array(marketSchema),
  periods: z.array(periodSchema),
});
export type Exchange = z.infer<typeof exchangeSchema>;
export type Property = z.infer<typeof propertySchema>;
export type Contract = z.infer<typeof contractSchema>;
export const collections = [
  "students",
  "properties",
  "contracts",
  "transactions",
  "marketHistory",
  "periods",
] as const;
export type Collection = (typeof collections)[number];
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function emptyExchange(classId: string): Exchange {
  return {
    format: "classbank-property-exchange",
    schemaVersion: "1.0.0",
    classId,
    exportId: uid(),
    exportedAt: new Date().toISOString(),
    source: "property-service",
    students: [],
    properties: [],
    contracts: [],
    transactions: [],
    marketHistory: [],
    periods: [],
  };
}
export function validateExchange(input: unknown): Exchange {
  const d = exchangeSchema.parse(input);
  for (const k of collections) {
    const seen = new Set();
    for (const row of d[k]) {
      if (seen.has(row.id)) throw Error(`${k}: 중복 ID ${row.id}`);
      seen.add(row.id);
    }
  }
  const student = (v: string | null | undefined) => {
    if (v && !d.students.some((s) => s.id === v))
      throw Error(`없는 학생 ID: ${v}`);
  };
  const prop = (v: string) => {
    if (!d.properties.some((p) => p.id === v))
      throw Error(`없는 자리 ID: ${v}`);
  };
  const seats = new Set();
  for (const p of d.properties) {
    if (seats.has(p.seatNumber)) throw Error("자리번호가 중복됩니다");
    seats.add(p.seatNumber);
    [p.ownerId, p.occupantId, p.initialOwnerId].forEach(student);
  }
  for (const c of d.contracts) {
    prop(c.propertyId);
    [c.buyerId, c.sellerId, c.landlordId, c.tenantId].forEach(student);
  }
  const txContracts = new Set();
  for (const t of d.transactions) {
    prop(t.propertyId);
    const c = d.contracts.find((c) => c.id === t.contractId);
    if (
      !c ||
      c.propertyId !== t.propertyId ||
      c.type !== t.type ||
      c.amount !== t.amount ||
      c.contractDate !== t.date
    )
      throw Error("거래기록과 계약 정보가 일치하지 않습니다");
    if (txContracts.has(t.contractId))
      throw Error("계약당 거래기록은 하나만 허용합니다");
    txContracts.add(t.contractId);
  }
  d.marketHistory.forEach((m) => prop(m.propertyId));
  for (const p of d.properties) {
    const leases = d.contracts.filter(
      (c) =>
        c.propertyId === p.id && c.type !== "sale" && c.status !== "cancelled",
    );
    for (let i = 0; i < leases.length; i++)
      for (let j = i + 1; j < leases.length; j++) {
        const a = leases[i],
          b = leases[j];
        if (
          a.startDate <= (b.endedAt ?? b.endDate!) &&
          b.startDate <= (a.endedAt ?? a.endDate!)
        )
          throw Error(`${p.seatNumber}번 자리 임대차 기간이 겹칩니다`);
      }
  }
  return d;
}
export function serializeExchange(d: Exchange) {
  return JSON.stringify(
    {
      ...validateExchange(d),
      exportId: uid(),
      exportedAt: new Date().toISOString(),
      source: "property-service",
    },
    null,
    2,
  );
}
