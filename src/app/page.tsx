import { redirect } from "next/navigation";
import { getCurrentHuman } from "@/lib/human-auth";

export default async function Home() {
  redirect((await getCurrentHuman()) ? "/room" : "/login");
}
