import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function Home() {
  const session = getSession();
  redirect(session ? "/dashboard" : "/login");
}
