"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import SessionClient from "./SessionClient";
import { getToken } from "@/lib/client";

export default function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  if (typeof window !== "undefined" && !getToken(code)) {
    // No seat in this session — send to the invite page to join properly.
    router.replace(`/join/${code}`);
    return null;
  }

  return <SessionClient code={code.toUpperCase()} />;
}
