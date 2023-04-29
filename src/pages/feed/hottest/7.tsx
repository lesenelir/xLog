import { GetServerSideProps } from "next"

import { SITE_URL } from "~/lib/env"
import { parsePost, setHeader } from "~/lib/json-feed"
import { ExpandedNote } from "~/lib/types"
import { getFeed } from "~/models/home.model"

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  setHeader(ctx)

  const feed = await getFeed({
    type: "hot",
    daysInterval: 7,
  })

  ctx.res.write(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "xLog Weekly Hot",
      icon: "https://ipfs.4everland.xyz/ipfs/bafkreigxdnr5lvtjxqin5upquomrti2s77hlgtjy5zaeu43uhpny75rbga",
      home_page_url: `${SITE_URL}/activities`,
      feed_url: `${SITE_URL}/feed/hottest`,
      items: feed?.list?.map((post: ExpandedNote) => parsePost(post)),
    }),
  )
  ctx.res.end()

  return {
    props: {},
  }
}

const LatestFeed: React.FC = () => null

export default LatestFeed
