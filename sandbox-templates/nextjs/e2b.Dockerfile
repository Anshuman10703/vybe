FROM node:22-slim

# Install curl
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

COPY compile_page.sh /compile_page.sh
RUN chmod +x /compile_page.sh

# Scaffold in a clean subdirectory (home dir already has dotfiles)
WORKDIR /home/user/nextjs-app

RUN npx --yes create-next-app@16.4.5 . --yes

RUN npx --yes shadcn@4.23.0 init --yes --base base --preset nova
RUN npx --yes shadcn@4.23.0 add --all --yes

# Copy everything (including dotfiles) into the home dir, then clean up
RUN cp -a /home/user/nextjs-app/. /home/user/ \
    && rm -rf /home/user/nextjs-app \
    && chown -R user:user /home/user

WORKDIR /home/user