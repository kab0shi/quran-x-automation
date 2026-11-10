const ENDPOINT = process.env.BUFFER_API_URL || "https://api.buffer.com";

async function graphql(token, query, variables = {}) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "quran-x-automation/1.0"
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Buffer API : ${payload.errors?.map((item) => item.message).join("; ") || response.status}`);
  }
  return payload.data;
}

export async function resolveXChannel(token, targetHandle) {
  const accountData = await graphql(token, `query { account { organizations { id name } } }`);
  const organizations = accountData?.account?.organizations ?? [];
  for (const organization of organizations) {
    const channelData = await graphql(token, `
      query Channels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id name displayName service isQueuePaused
        }
      }
    `, { organizationId: organization.id });
    const channel = (channelData?.channels ?? []).find((item) => {
      const names = [item.name, item.displayName].filter(Boolean).map((value) => value.replace(/^@/, "").toLowerCase());
      return ["twitter", "x"].includes(String(item.service).toLowerCase()) && names.includes(targetHandle.replace(/^@/, "").toLowerCase());
    });
    if (channel) return { ...channel, organizationId: organization.id };
  }
  throw new Error(`Canal X @${targetHandle.replace(/^@/, "")} introuvable dans Buffer`);
}

export async function listScheduledPosts(token, organizationId, channelId) {
  // Buffer returns a Relay connection; walk every page to avoid duplicate posts
  // if more than one page of posts has already been scheduled.
  const posts = [];
  let after = null;
  for (let page = 0; page < 40; page += 1) {
    const data = await graphql(token, `
      query Scheduled($organizationId: OrganizationId!, $channelIds: [ChannelId!], $after: String) {
        posts(first: 50, after: $after, input: {
          organizationId: $organizationId,
          filter: { status: [scheduled], channelIds: $channelIds }
        }) {
          edges { node { id text dueAt status channelId } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { organizationId, channelIds: [channelId], after });
    const connection = data?.posts;
    if (!connection?.edges || !connection?.pageInfo) {
      throw new Error("Buffer API : liste des publications programmées invalide");
    }
    posts.push(...connection.edges.map((edge) => edge.node));
    if (!connection.pageInfo.hasNextPage) return posts;
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) {
      throw new Error("Buffer API : curseur de pagination invalide");
    }
    after = connection.pageInfo.endCursor;
  }
  throw new Error("Buffer API : limite de pagination atteinte");
}

export async function createScheduledImagePost(token, { channelId, text, dueAt, imageUrl, altText }) {
  const data = await graphql(token, `
    mutation CreateImagePost($input: CreatePostInput!) {
      createPost(input: $input) { id text dueAt status }
    }
  `, {
    input: {
      channelId,
      text,
      schedulingType: "automatic",
      mode: "customScheduled",
      dueAt,
      assets: [{ image: { url: imageUrl, metadata: { altText } } }]
    }
  });
  return data?.createPost;
}
