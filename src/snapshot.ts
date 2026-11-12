import { z } from "zod";
import { emptyExchange } from "../shared/exchange";
import { stateAt } from "./domain";
import type { LocalState } from "./storage";
import { groupDefaults } from "./classroom-layout";
export type NameMode = "anonymous" | "alias" | "real";
export type PublishOptions = {
  names: NameMode;
  history: boolean;
  aliases: Record<string, string>;
};
export const snapshotSchema = z.object({
  format: z.literal("classroom-readonly-v1"),
  publishedAt: z.iso.datetime(),
  names: z.enum(["anonymous", "alias", "real"]),
  seatCount: z.union([z.literal(27), z.literal(30)]).default(27),
  groupNames: z.array(z.string().max(100)).length(6),
  seats: z.array(
    z.object({
      number: z.string().max(200),
      owner: z.string().max(200).nullable(),
      tenant: z.string().max(200).nullable(),
      rental: z.enum(["rent", "jeonse"]).nullable(),
      price: z.number().finite().nonnegative(),
      history: z.array(
        z.object({
          price: z.number().finite().nonnegative(),
          at: z.iso.datetime({ offset: true }),
        }),
      ),
    }),
  ),
});
export type PublicSnapshot = z.infer<typeof snapshotSchema>;
export function makeSnapshot(
  local: LocalState,
  options: PublishOptions,
): PublicSnapshot {
  const people = new Map(
    local.data.students.map((s, i) => [
      s.id,
      options.names === "real"
        ? s.name
        : options.names === "alias"
          ? options.aliases[s.id]?.trim() || `친구 ${i + 1}`
          : `친구 ${i + 1}`,
    ]),
  );
  const label = (id: string | null) =>
    id ? (people.get(id) ?? "미지정") : null;
  return snapshotSchema.parse({
    format: "classroom-readonly-v1",
    publishedAt: new Date().toISOString(),
    names: options.names,
    seatCount: local.classroom?.seatCount ?? 27,
    groupNames: local.classroom?.groupNames ?? groupDefaults,
    seats: local.data.properties.map((p) => {
      const current = stateAt(local.data, p);
      return {
        number: p.seatNumber,
        owner: label(current.ownerId),
        tenant: current.lease ? label(current.lease.tenantId) : null,
        rental: current.lease?.type ?? null,
        price: p.marketPrice,
        history: options.history
          ? local.data.marketHistory
              .filter((h) => h.propertyId === p.id)
              .map((h) => ({ price: h.price, at: h.recordedAt }))
          : [],
      };
    }),
  });
}
// This adapter contains synthetic display records, never actual contracts or source identifiers.
export function viewerState(snapshot: PublicSnapshot): LocalState {
  const data = emptyExchange("public-view");
  const identities = new Map<string, string>();
  const person = (name: string | null) => {
    if (!name) return null;
    let id = identities.get(name);
    if (!id) {
      id = "display-" + identities.size;
      identities.set(name, id);
      data.students.push({ id, name });
    }
    return id;
  };
  snapshot.seats.forEach((s, i) => {
    const id = "display-seat-" + i,
      ownerId = person(s.owner),
      tenantId = person(s.tenant);
    data.properties.push({
      id,
      seatNumber: s.number,
      ownerId,
      occupantId: tenantId ?? ownerId,
      initialOwnerId: ownerId,
      marketPrice: s.price,
      auctionPrice: 0,
      latestSalePrice: null,
      position: null,
      revision: 1,
    });
    if (s.rental && tenantId)
      data.contracts.push({
        id: "display-rental-" + i,
        propertyId: id,
        type: s.rental,
        sellerId: null,
        buyerId: null,
        landlordId: ownerId,
        tenantId,
        amount: 0,
        paymentCycle: null,
        contractDate: "1970-01-01",
        startDate: "1970-01-01",
        endDate: "9999-12-31",
        terms: "",
        status: "active",
        revision: 1,
      });
    s.history.forEach((h, j) =>
      data.marketHistory.push({
        id: `display-history-${i}-${j}`,
        propertyId: id,
        price: h.price,
        recordedAt: h.at,
      }),
    );
  });
  return {
    data,
    image: null,
    settings: { price: true, owner: true, status: true, autoPrice: false },
    audits: [],
    sequence: 0,
    periodViews: {},
    classroom: {
      groupNames: snapshot.groupNames,
      seatCount: snapshot.seatCount,
      animated: true,
    },
  };
}
export function renderSnapshot(
  template: string,
  snapshot: PublicSnapshot,
): string {
  const marker = "__CLASSROOM_PUBLIC_DATA__";
  if (template.split(marker).length !== 2)
    throw Error("게시 템플릿이 올바르지 않습니다. 앱을 다시 빌드해 주세요.");
  const escaped = JSON.stringify(snapshotSchema.parse(snapshot)).replace(
    /[<>&\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  return template.replace(marker, () => escaped);
}
