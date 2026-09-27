import type { Metadata } from "next";
import { DeskConsole } from "@/components/desk/desk-console";

export const metadata: Metadata = { title: "交易台" };

export default function DeskPage() {
  return <DeskConsole />;
}
