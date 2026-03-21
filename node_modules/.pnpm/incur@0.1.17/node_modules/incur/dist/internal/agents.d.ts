/** Agent configuration for skill installation. */
export type Agent = {
    /** Display name. */
    name: string;
    /** Absolute path to the global skills directory. */
    globalSkillsDir: string;
    /** Project-relative skills directory path. */
    projectSkillsDir: string;
    /** Whether this agent uses the canonical `.agents/skills` path. */
    universal: boolean;
    /** Checks if the agent is installed on the system. */
    detect(): boolean;
};
/** All known agent definitions. */
export declare const all: Agent[];
/** Detects which agents are installed on the system. */
export declare function detect(): Agent[];
/**
 * Installs skill directories to the canonical location and creates symlinks for
 * detected non-universal agents.
 *
 * @param sourceDir - Directory containing skill subdirectories (each with a `SKILL.md`).
 * @param options - Installation options.
 * @returns Installed canonical paths.
 */
export declare function install(sourceDir: string, options?: install.Options): install.Result;
export declare namespace install {
    type Options = {
        /** Override detected agents. */
        agents?: Agent[] | undefined;
        /** Working directory for project-local installs. */
        cwd?: string | undefined;
        /** Install globally. Defaults to `true`. */
        global?: boolean | undefined;
    };
    type Result = {
        /** Canonical install paths. */
        paths: string[];
        /** Per-agent install details (non-universal agents only). */
        agents: AgentInstall[];
    };
    type AgentInstall = {
        /** Agent display name. */
        agent: string;
        /** Installed path. */
        path: string;
        /** Whether it was symlinked or copied. */
        mode: 'symlink' | 'copy';
    };
}
/**
 * Removes a skill by name from the canonical location and all detected agent directories.
 */
export declare function remove(skillName: string, options?: {
    global?: boolean | undefined;
    cwd?: string | undefined;
}): void;
//# sourceMappingURL=agents.d.ts.map