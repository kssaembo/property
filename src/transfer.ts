import Papa from "papaparse";
import {
  collections,
  contractSchema,
  type Collection,
  type Exchange,
  validateExchange,
} from "../shared/exchange";
import { assertBusiness, clone, saveContract } from "./domain";
export type Difference = {
  key: Collection;
  id: string;
  kind: "new" | "same" | "conflict";
  local: unknown;
  incoming: unknown;
  choice: "keep" | "incoming" | "skip";
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function preview(current: Exchange, incoming: unknown): Difference[] {
  const next = validateExchange(incoming);
  if (current.classId !== next.classId)
    throw Error("학급 ID가 다릅니다. 자동 병합할 수 없습니다.");
  return collections.flatMap((key) =>
    next[key].map((row) => {
      const local = current[key].find((r) => r.id === row.id);
      const kind = !local
        ? "new"
        : canonical(local) === canonical(row)
          ? "same"
          : "conflict";
      return {
        key,
        id: row.id,
        kind,
        local,
        incoming: row,
        choice: kind === "new" ? "incoming" : "keep",
      } as Difference;
    }),
  );
}
export function merge(current: Exchange, diffs: Difference[]) {
  const d = clone(current);
  for (const diff of diffs.filter((v) => v.choice === "incoming")) {
    const rows = d[diff.key] as { id: string }[];
    const i = rows.findIndex((r) => r.id === diff.id);
    if (i < 0) rows.push(clone(diff.incoming) as { id: string });
    else rows[i] = clone(diff.incoming) as { id: string };
  }
  assertBusiness(d);
  for (const p of d.properties) {
    /* Imported current fields must agree with the recorded chain. */
    const computed = stateAtForImport(d, p);
    if (
      computed.ownerId !== p.ownerId ||
      computed.latestSalePrice !== p.latestSalePrice
    )
      throw Error(
        "자리 소유권·최근 매매가와 계약이 불일치합니다. 관련 항목을 함께 선택하세요.",
      );
  }
  return d;
}
import { stateAt as stateAtForImport } from "./domain";
export function csvExport(d: Exchange, key: Collection) {
  return (
    "\uFEFF" +
    Papa.unparse(
      d[key].map((r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            k,
            v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : v,
          ]),
        ),
      ),
      { escapeFormulae: true },
    )
  );
}
export function csvImport(current: Exchange, key: Collection, text: string) {
  const result = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    { header: true, skipEmptyLines: "greedy" },
  );
  if (result.errors.length)
    throw Error("CSV 형식 오류: " + result.errors[0].message);
  if (!result.meta.fields?.includes("id"))
    throw Error("CSV에 id 열이 필요합니다");
  let d = clone(current);
  const seen = new Set();
  for (const row of result.data) {
    if (!row.id || seen.has(row.id))
      throw Error("CSV ID가 비었거나 중복됩니다");
    seen.add(row.id);
    const previous = current[key].find((r) => r.id === row.id);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === "") {
        if (!previous && k === "terms") patch[k] = "";
        continue;
      }
      patch[k] =
        v === "null"
          ? null
          : [
                "amount",
                "price",
                "auctionPrice",
                "latestSalePrice",
                "marketPrice",
                "revision",
              ].includes(k)
            ? Number(v)
            : k === "position"
              ? JSON.parse(v)
              : v;
    }
    const item = { ...previous, ...patch };
    if (key === "contracts") {
      const c = contractSchema.parse(item);
      if (canonical(c) !== canonical(previous)) d = saveContract(d, c);
      continue;
    }
    const rows = d[key] as unknown[];
    const index = rows.findIndex((r) => (r as { id: string }).id === row.id);
    if (index < 0) rows.push(item);
    else rows[index] = item;
  }
  return validateExchange(d);
}
export function download(
  text: string,
  name: string,
  type = "application/json",
) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
