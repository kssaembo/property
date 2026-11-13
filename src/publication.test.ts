import { describe, it, expect, vi } from "vitest";
import { emptyExchange } from "../shared/exchange";
import { makeSnapshot, renderSnapshot, viewerState } from "./snapshot";
import { stateAt } from "./domain";
import {
  createActors,
  tickActors,
  chooseDestination,
  route,
  phases,
} from "./life";
import { publishToGitHub } from "./publish-client";
import type { LocalState } from "./storage";
function fixture(): LocalState {
  const data = emptyExchange("PRIVATE-CLASS");
  data.students = [
    { id: "PRIVATE-STUDENT", name: "비공개실명" },
    { id: "PRIVATE-TENANT", name: "다른실명" },
  ];
  data.properties = [
    {
      id: "PRIVATE-PROPERTY",
      seatNumber: "1",
      ownerId: "PRIVATE-STUDENT",
      initialOwnerId: "PRIVATE-STUDENT",
      occupantId: "PRIVATE-TENANT",
      marketPrice: 150,
      auctionPrice: 80,
      latestSalePrice: null,
      position: null,
      revision: 1,
    },
  ];
  data.contracts = [
    {
      id: "PRIVATE-CONTRACT",
      propertyId: "PRIVATE-PROPERTY",
      type: "rent",
      sellerId: null,
      buyerId: null,
      landlordId: "PRIVATE-STUDENT",
      tenantId: "PRIVATE-TENANT",
      amount: 37,
      paymentCycle: "monthly",
      contractDate: "2020-01-01",
      startDate: "2020-01-01",
      endDate: "2099-01-01",
      terms: "PRIVATE-TERMS",
      status: "active",
      revision: 1,
    },
  ];
  data.marketHistory = [
    {
      id: "PRIVATE-HISTORY",
      propertyId: "PRIVATE-PROPERTY",
      price: 150,
      recordedAt: "2026-01-01T00:00:00Z",
    },
  ];
  return {
    data,
    image: "PRIVATE-IMAGE",
    settings: { price: true, owner: true, status: true, autoPrice: false },
    audits: [],
    sequence: 4,
    periodViews: {},
  };
}
const options = { names: "anonymous" as const, history: true, aliases: {} };
describe("Public snapshot", () => {
  it("whitelists display data, removes identities and private ledger, preserves source", () => {
    const local = fixture(),
      before = JSON.stringify(local),
      snap = makeSnapshot(local, options),
      json = JSON.stringify(snap);
    expect(json).not.toContain("PRIVATE-");
    expect(json).not.toContain("비공개실명");
    expect(json).not.toContain("다른실명");
    expect(snap.seats[0]).not.toHaveProperty("amount");
    expect(snap.seats[0]).toMatchObject({
      owner: "친구 1",
      tenant: "친구 2",
      rental: "rent",
      price: 150,
    });
    expect(JSON.stringify(local)).toBe(before);
  });
  it("publishes real names only by explicit choice and allows history exclusion", () => {
    expect(
      makeSnapshot(fixture(), { ...options, names: "real", history: false })
        .seats[0],
    ).toMatchObject({ owner: "비공개실명", history: [] });
  });
  it("uses provided aliases and fallback labels", () =>
    expect(
      makeSnapshot(fixture(), {
        ...options,
        names: "alias",
        aliases: { "PRIVATE-STUDENT": "별" },
      }).seats[0],
    ).toMatchObject({ owner: "별", tenant: "친구 2" }));
  it("freezes occupant snapshot using synthetic display IDs", () => {
    const local = viewerState(makeSnapshot(fixture(), options));
    expect(stateAt(local.data, local.data.properties[0]).lease?.type).toBe(
      "rent",
    );
    expect(JSON.stringify(local)).not.toContain("PRIVATE-");
  });
  it("does not leak cancelled leases into public occupancy", () => {
    const l = fixture();
    l.data.contracts[0].status = "cancelled";
    expect(makeSnapshot(l, options).seats[0].tenant).toBeNull();
  });
  it("escapes script endings and HTML so student text cannot execute", () => {
    const l = fixture();
    l.data.students[0].name = "</script><img src=x onerror=alert(1)>&\u2028";
    const snap = makeSnapshot(l, { ...options, names: "real" });
    const html = renderSnapshot(
      '<script type="application/json">__CLASSROOM_PUBLIC_DATA__</script>',
      snap,
    );
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain("<img");
    expect(
      JSON.parse(html.slice(html.indexOf(">") + 1, html.lastIndexOf("<"))),
    ).toEqual(snap);
  });
  it("rejects missing or duplicate template markers", () => {
    const s = makeSnapshot(fixture(), options);
    expect(() => renderSnapshot("", s)).toThrow();
    expect(() =>
      renderSnapshot("__CLASSROOM_PUBLIC_DATA____CLASSROOM_PUBLIC_DATA__", s),
    ).toThrow();
  });
});
describe("Ambient classroom", () => {
  it("routes along axis-aligned aisles", () => {
    let p = { x: 360, y: 216 };
    for (const q of route(p, { x: 876, y: 452 })) {
      expect(p.x === q.x || p.y === q.y).toBe(true);
      p = q;
    }
    expect(p).toEqual({ x: 876, y: 452 });
  });
  it("offers six phases with reading, lesson, stretching, chat and plants", () => {
    expect(phases).toHaveLength(6);
    expect(
      [1, 2, 3, 4, 5].map(
        (p) => chooseDestination(createActors()[0], p).activity,
      ),
    ).toEqual(["read", "listen", "stretch", "chat", "water"]);
  });
  it("does not mutate inputs or teleport after a hidden-tab delay", () => {
    const a = createActors(),
      before = JSON.stringify(a),
      next = tickActors(a, 100, 0, () => 0.5);
    expect(JSON.stringify(a)).toBe(before);
    next.forEach((p, i) =>
      expect(Math.hypot(p.x - a[i].x, p.y - a[i].y)).toBeLessThanOrEqual(
        a[i].speed * 0.25 + 0.001,
      ),
    );
  });
  it("keeps all actors within the classroom through every phase", () => {
    let a = createActors();
    const seen = new Set<string>();
    for (let p = 0; p < 6; p++)
      for (let i = 0; i < 1600; i++) {
        a = tickActors(a, 0.1, p, () => 0.4);
        a.forEach((x) => {
          seen.add(x.activity);
          expect(x.x).toBeGreaterThanOrEqual(80);
          expect(x.x).toBeLessThanOrEqual(1160);
          expect(x.y).toBeGreaterThanOrEqual(180);
          expect(x.y).toBeLessThanOrEqual(720);
        });
      }
    expect(seen.has("read")).toBe(true);
    expect(seen.has("listen")).toBe(true);
    expect(seen.has("chat")).toBe(true);
  });
});
const html =
  '<meta name="classroom-public" content="classroom-readonly-v1">한글';
function mock(responses: Array<[number, unknown]>) {
  return vi.fn(async () => {
    const [status, body] = responses.shift()!;
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status },
    );
  }) as unknown as typeof fetch;
}
const pages = {
  source: { branch: "main", path: "/docs" },
  html_url: "https://example.github.io/class/",
};
describe("GitHub publication", () => {
  it("writes a single managed file with Unicode and branch, keeps token out of body", async () => {
    const req = mock([
      [200, pages],
      [404, {}],
      [201, {}],
    ]);
    expect(await publishToGitHub("teacher/class", "SECRET", html, req)).toBe(
      "https://example.github.io/class/published/classroom.html",
    );
    const calls = vi.mocked(req).mock.calls;
    expect(calls[2][0]).toContain("/contents/docs/published/classroom.html");
    const body = JSON.parse(calls[2][1]!.body as string);
    expect(body.branch).toBe("main");
    expect(Buffer.from(body.content, "base64").toString()).toBe(html);
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
  it("uses the latest SHA when updating a managed publication", async () => {
    const req = mock([
      [200, pages],
      [200, { sha: "latest", type: "file" }],
      [200, html],
      [200, {}],
    ]);
    await publishToGitHub("a/b", "token", html, req);
    expect(
      JSON.parse(vi.mocked(req).mock.calls[3][1]!.body as string).sha,
    ).toBe("latest");
  });
  it("refuses to overwrite unrelated files", async () => {
    const req = mock([
      [200, pages],
      [200, { sha: "x", type: "file" }],
      [200, "unrelated"],
    ]);
    await expect(publishToGitHub("a/b", "token", html, req)).rejects.toThrow(
      "덮어쓰지",
    );
    expect(vi.mocked(req)).toHaveBeenCalledTimes(3);
  });
  it("requires an enabled branch-based Pages site", async () => {
    await expect(
      publishToGitHub("a/b", "token", html, mock([[404, {}]])),
    ).rejects.toThrow("활성화");
    await expect(
      publishToGitHub(
        "a/b",
        "token",
        html,
        mock([[200, { ...pages, build_type: "workflow" }]]),
      ),
    ).rejects.toThrow("branch");
  });
  it("reports concurrent updates without forcing overwrite", async () => {
    await expect(
      publishToGitHub(
        "a/b",
        "token",
        html,
        mock([
          [200, pages],
          [404, {}],
          [409, {}],
        ]),
      ),
    ).rejects.toThrow("다른 곳");
  });
  it("rejects invalid paths and unprepared templates before network use", async () => {
    const req = mock([]);
    await expect(publishToGitHub("../b", "token", html, req)).rejects.toThrow();
    await expect(
      publishToGitHub("a/b", "token", "__CLASSROOM_PUBLIC_DATA__", req),
    ).rejects.toThrow();
    expect(vi.mocked(req)).not.toHaveBeenCalled();
  });
});

