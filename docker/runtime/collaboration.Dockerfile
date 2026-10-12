# Coolify resource for the collaboration service. It builds nothing: CI already built
# and pushed this exact commit's image (.github/workflows/docker-publish.yml),
# and Coolify passes the commit it is deploying as SOURCE_COMMIT ("Source
# commit availability: Available during build"). Pulling by SHA rather than
# a moving tag means a cached image can never stand in for a new release.
# If the image for this commit does not exist yet, the pull fails and the
# running container stays up.
ARG SOURCE_COMMIT
FROM ghcr.io/teenxgrails/needt-collaboration:${SOURCE_COMMIT}
