import type { Property } from "../shared/exchange";
export type DeskSlot = {
  number: string;
  group: number;
  x: number;
  y: number;
  property?: Property;
};
export const groupDefaults = [
  "모둠 1",
  "모둠 2",
  "모둠 3",
  "모둠 4",
  "모둠 5",
  "모둠 6",
];
// Visual slots are not database records. Opening the classroom never invents ownership.
export function classroomSlots(
  properties: Property[],
  count: 27 | 30 = 27,
): DeskSlot[] {
  const slots: DeskSlot[] = [];
  let n = 1;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 6; col++) {
      if (count === 27 && row === 4 && col % 2 === 0) continue;
      const group = 2 - Math.floor(col / 2) + (row >= 2 ? 3 : 0);
      slots.push({
        number: String(n++),
        group,
        x: 166 + Math.floor(col / 2) * 325 + (col % 2) * 134,
        y: row < 2 ? 494 - row * 91 : 276 - (row - 2) * 88,
      });
    }
  // Keep foreign/imported seat numbers and IDs visible, without overwriting any record.
  const free = [...slots];
  const assigned = new Set<string>();
  for (const slot of slots) {
    const p = properties.find((p) => p.seatNumber === slot.number);
    if (p) {
      slot.property = p;
      assigned.add(p.id);
      free.splice(free.indexOf(slot), 1);
    }
  }
  for (const p of properties.filter((p) => !assigned.has(p.id))) {
    const slot = free.shift();
    if (slot) {
      slot.property = p;
      slot.number = p.seatNumber;
    } else {
      const i = slots.length - count;
      slots.push({
        number: p.seatNumber,
        group: 6,
        x: 130 + (i % 8) * 130,
        y: 595 + Math.floor(i / 8) * 82,
        property: p,
      });
    }
  }
  return slots;
}
