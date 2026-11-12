import { writeFileSync, mkdirSync } from "node:fs";
import { z } from "zod";
import {
  exchangeSchema,
  emptyExchange,
  validateExchange,
} from "../shared/exchange.ts";
mkdirSync("samples", { recursive: true });
writeFileSync(
  "shared/exchange.schema.json",
  JSON.stringify(
    z.toJSONSchema(exchangeSchema, {
      target: "draft-2020-12",
      unrepresentable: "any",
    }),
    null,
    2,
  ),
);
const d = emptyExchange("sample-class");
d.students = [
  { id: "sample-student-a", name: "예시 학생 A" },
  { id: "sample-student-b", name: "예시 학생 B" },
];
d.properties = [
  {
    id: "sample-seat-1",
    seatNumber: "1",
    ownerId: "sample-student-a",
    occupantId: "sample-student-a",
    auctionPrice: 100,
    latestSalePrice: null,
    marketPrice: 130,
    position: { x: 0.3, y: 0.4 },
    revision: 1,
    initialOwnerId: "sample-student-a",
    initialSalePrice: null,
  },
];
d.periods = [
  {
    id: "sample-period-1",
    label: "예시 기간",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  },
];
writeFileSync(
  "samples/exchange.sample.json",
  JSON.stringify(validateExchange(d), null, 2),
);
writeFileSync(
  "samples/students.csv",
  "\uFEFFid,name\r\nsample-student-a,예시 학생 A\r\nsample-student-b,예시 학생 B\r\n",
);
writeFileSync(
  "samples/properties.csv",
  '\uFEFFid,seatNumber,ownerId,occupantId,auctionPrice,latestSalePrice,marketPrice,position,revision\r\nsample-seat-1,1,sample-student-a,sample-student-a,100,null,130,"{""x"":0.3,""y"":0.4}",1\r\n',
);
writeFileSync(
  "samples/contracts.csv",
  "\uFEFFid,propertyId,type,buyerId,sellerId,landlordId,tenantId,amount,paymentCycle,contractDate,startDate,endDate,terms,status,revision\r\nsample-contract-1,sample-seat-1,sale,sample-student-b,sample-student-a,null,null,120,null,2026-11-12,2026-11-12,null,,active,1\r\n",
);
