import "server-only";
import { db } from "@/lib/db";

/** Library documents that have extracted text, for the source pickers. */
export function documentOptions() {
  return db.document.findMany({
    where: { content: { not: "" } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, title: true, fileType: true, kind: true },
  });
}
