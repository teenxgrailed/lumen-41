- Production deploys no longer stall while merges keep landing. A release used
  to stand down unless its commit was still the head of main, and with a
  25-minute build and merges every few minutes none ever deployed (production
  sat at 4c9c2ee). Now the newest finished build deploys unless production
  already runs it or a descendant: the deploy script pins the Coolify
  application to the built commit first (needs the token's `write` ability;
  without it, it deploys the head of main if its images are already in GHCR).

