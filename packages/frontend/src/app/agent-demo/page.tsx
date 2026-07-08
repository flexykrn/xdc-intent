"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AgentDemoRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/agent");
  }, [router]);

  return null;
}
