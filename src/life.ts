export type Point = { x: number; y: number };
export type Activity =
  "walk" | "read" | "listen" | "chat" | "stretch" | "water" | "watch";
export type Actor = {
  id: number;
  x: number;
  y: number;
  path: Point[];
  activity: Activity;
  destination: Activity;
  wait: number;
  facing: "left" | "right" | "back" | "front";
  seat?: number;
  speed: number;
};
export const phases = [
  "쉬는 시간",
  "조용한 독서",
  "함께 듣는 수업",
  "기지개 시간",
  "모둠 이야기",
  "창밖 구경",
] as const;
export const conversations = [
  ["오늘 구름이 솜사탕 같아.", "그러게! 저건 토끼 같아."],
  ["이 책 정말 재미있어!", "다 읽으면 나도 빌려줘."],
  ["오늘 급식은 뭘까?", "맛있는 냄새가 나는 것 같아."],
  ["우리 모둠 이름 멋지지?", "응, 다 같이 골랐잖아!"],
  ["쉬는 시간엔 뭐 할래?", "조금 걷다가 책 읽을래."],
  ["이 문제 같이 풀어 볼까?", "좋아! 그림으로 그려 보자."],
  ["화분에 새잎이 났어!", "내일도 같이 살펴보자."],
  ["연필 좀 빌려줄 수 있어?", "물론이지. 여기 있어!"],
  ["창가 자리는 햇빛이 따뜻해.", "햇살이 책 위에 내려앉았네."],
  ["우리 오늘도 힘내자!", "좋아, 천천히 해 보자."],
  ["방금 좋은 생각이 났어.", "어떤 생각인지 들려줘!"],
  ["잠깐 어깨를 펴 볼까?", "쭈욱! 한결 편해졌어."],
  ["책갈피를 직접 만들었어.", "색이 정말 예쁘다!"],
  ["다음 시간 준비됐어?", "공책이랑 연필 준비 완료!"],
  ["종이비행기는 왜 날까?", "날개 모양 때문 아닐까?"],
  ["오늘 교실이 참 평화로워.", "이렇게 쉬는 것도 좋아."],
  ["네 그림에 꽃이 피었네.", "우리 교실 화분을 그렸어."],
  ["별빛은 낮에도 있을까?", "해가 밝아서 안 보일 거야."],
  ["같이 정리하니까 금방이다.", "맞아. 고마워!"],
  ["고양이는 무슨 꿈을 꿀까?", "아마 햇볕에서 낮잠 자는 꿈?"],
];
const xs = [110, 450, 775, 1110],
  ys = [292, 510, 710];
export const visualY = (y: number) => 210 + y * 0.78;
const nearest = (arr: number[], n: number) =>
  arr.reduce((a, b) => (Math.abs(n - b) < Math.abs(n - a) ? b : a));
// All free movement uses the perimeter/cross-aisles; seat approaches end at a chair.
export function route(from: Point, to: Point): Point[] {
  const fx = nearest(xs, from.x),
    tx = nearest(xs, to.x),
    fy = nearest(ys, from.y),
    ty = nearest(ys, to.y);
  const raw = [
    { x: from.x, y: fy },
    { x: fx, y: fy },
    { x: fx, y: ty },
    { x: tx, y: ty },
    { x: to.x, y: ty },
    to,
  ];
  return raw.filter(
    (p, i) => i === 0 || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y,
  );
}
export function createActors(): Actor[] {
  return Array.from({ length: 8 }, (_, id) => ({
    id,
    x: xs[id % 4] + (id >= 4 ? 28 : 0),
    y: id >= 4 ? 710 : 510,
    path: [],
    activity: "watch",
    destination: "watch",
    wait: id * 0.8,
    facing: "front",
    speed: 28 + id * 2,
  }));
}
const seatSpots: Point[] = [
  { x: 360, y: 305 },
  { x: 685, y: 305 },
  { x: 1010, y: 305 },
  { x: 226, y: 545 },
  { x: 551, y: 545 },
  { x: 876, y: 545 },
  { x: 360, y: 545 },
  { x: 1010, y: 545 },
];
export function chooseDestination(
  actor: Actor,
  phase: number,
  random: () => number = Math.random,
): { point: Point; activity: Activity } {
  if (phase === 1)
    return {
      point:
        actor.id < 4
          ? { x: actor.id % 2 ? 1110 : 110, y: 565 + actor.id * 10 }
          : seatSpots[actor.id],
      activity: "read",
    };
  if (phase === 2) return { point: seatSpots[actor.id], activity: "listen" };
  if (phase === 3)
    return {
      point: { x: xs[actor.id % 4], y: actor.id >= 4 ? 710 : 510 },
      activity: "stretch",
    };
  if (phase === 4)
    return {
      point: { x: actor.id % 4 < 2 ? 450 : 775, y: actor.id >= 4 ? 710 : 510 },
      activity: "chat",
    };
  if (phase === 5)
    return {
      point: { x: xs[actor.id % 4] + (actor.id >= 4 ? 35 : 0), y: 292 },
      activity: actor.id % 3 === 0 ? "water" : "watch",
    };
  const spots = [
    { x: 110, y: 560 },
    { x: 1110, y: 565 },
    { x: 450, y: 510 },
    { x: 775, y: 510 },
    { x: 450, y: 710 },
    { x: 775, y: 710 },
    { x: 110, y: 292 },
    { x: 1110, y: 292 },
  ];
  return {
    point: spots[Math.floor(random() * spots.length)],
    activity: ["read", "watch", "chat", "stretch", "water"][
      Math.floor(random() * 5)
    ] as Activity,
  };
}
export function tickActors(
  actors: Actor[],
  dt: number,
  phase: number,
  random: () => number = Math.random,
): Actor[] {
  return actors.map((old) => {
    const a = { ...old, path: old.path.map((p) => ({ ...p })) };
    let budget = Math.min(dt, 0.25) * a.speed;
    if (!a.path.length) {
      a.wait -= dt;
      if (a.wait > 0) return a;
      const dest = chooseDestination(a, phase, random);
      const point = {
        ...dest.point,
        x: dest.point.x + (phase === 4 ? (a.id % 2 ? 22 : -22) : 0),
      };
      a.path = route(a, point);
      a.destination = dest.activity;
      a.activity = "walk";
    }
    while (a.path.length && budget > 0) {
      const p = a.path[0],
        dx = p.x - a.x,
        dy = p.y - a.y,
        dist = Math.hypot(dx, dy);
      if (dist < 0.1) {
        a.path.shift();
        continue;
      }
      a.facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
            ? "back"
            : "front";
      const step = Math.min(dist, budget);
      a.x += (dx / dist) * step;
      a.y += (dy / dist) * step;
      budget -= step;
      if (step === dist) a.path.shift();
    }
    if (!a.path.length) {
      a.activity = a.destination;
      a.wait = 8 + random() * 18;
      a.facing =
        a.activity === "listen"
          ? "front"
          : a.activity === "watch"
            ? "back"
            : "front";
    }
    return a;
  });
}
