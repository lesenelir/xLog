import { useState } from "react"

import { SiteLayout } from "~/components/site/SiteLayout"
import { SitePage } from "~/components/site/SitePage"
import { SITE_URL } from "~/lib/env"

export default function Custom404() {
  const [siteId, setSiteId] = useState("")

  try {
    fetch(`/api/host2handle?host=${window.location.host}`)
      .then((res) => res.json())
      .then((tenant) => {
        if (tenant.subdomain) {
          setSiteId(tenant.subdomain)
        }
      })
  } catch (error) {}

  return (
    <SiteLayout siteId={siteId} type="404">
      <SitePage
        page={
          {
            title: "404 - Whoops, this page is gone.",
            body: {
              content: `
- [Back to Home](/)
- [All posts](/archives)

![image](${SITE_URL}/assets/404.svg)
`,
            },
          } as any
        }
      />
    </SiteLayout>
  )
}
