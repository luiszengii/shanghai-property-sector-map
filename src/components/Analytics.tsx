import Script from "next/script";

const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function Analytics() {
  if (!scriptUrl || !websiteId) {
    return null;
  }

  return (
    <Script
      defer
      data-website-id={websiteId}
      src={scriptUrl}
      strategy="afterInteractive"
    />
  );
}
