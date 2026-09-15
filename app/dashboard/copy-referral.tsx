"use client";

import { useState } from "react";

const invite = "https://discord.gg/62Zp4x2urb";

export default function CopyReferral() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(invite);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="np-ref-link"><span>INVITE</span><code>{invite}</code><button type="button" onClick={copy}>{copied ? "Copied!" : "▣ Copy link"}</button></div>;
}
