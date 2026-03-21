FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base development tools and SSH server
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    jq \
    build-essential \
    openssh-server \
    ca-certificates \
    iproute2 \
    procps \
    sudo \
    unzip \
    vim \
    less \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH server
RUN mkdir -p /var/run/sshd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    echo "PermitEmptyPasswords no" >> /etc/ssh/sshd_config && \
    ssh-keygen -A

# Install jj (jujutsu) — the version control system Codeplane is built for
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        JJ_ARCH="x86_64-unknown-linux-gnu"; \
    elif [ "$ARCH" = "arm64" ]; then \
        JJ_ARCH="aarch64-unknown-linux-gnu"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL "https://github.com/jj-vcs/jj/releases/latest/download/jj-${JJ_ARCH}.tar.gz" | tar xz -C /usr/local/bin/

# Install bun
ENV BUN_INSTALL="/usr/local/bun"
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun && \
    ln -sf /usr/local/bun/bin/bunx /usr/local/bin/bunx

# Create a default workspace user
RUN useradd -m -s /bin/bash -G sudo workspace && \
    echo "workspace ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/workspace && \
    mkdir -p /home/workspace/.ssh && \
    chmod 700 /home/workspace/.ssh && \
    chown -R workspace:workspace /home/workspace/.ssh

# Create workspace directory
RUN mkdir -p /workspace && chown workspace:workspace /workspace

WORKDIR /workspace

# Expose SSH port
EXPOSE 22

# Healthcheck: verify sshd is listening
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD ss -tlnp | grep -q ':22' || exit 1

# Start SSH server in foreground
CMD ["/usr/sbin/sshd", "-D", "-e"]
