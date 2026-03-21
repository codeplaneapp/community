import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { detectRunner } from './internal/pm.js';
/** Registers the CLI as an MCP server via `npx add-mcp` and direct config writes for unsupported agents. */
export async function register(name, options = {}) {
    const runner = detectRunner();
    const command = options.command ?? `${runner} ${detectPackageSpecifier(name)} --mcp`;
    const targetAgents = options.agents ?? [];
    const ampOnly = targetAgents.length === 1 && targetAgents[0] === 'amp';
    const agents = [];
    // Run add-mcp for agents it supports (skip if only targeting Amp)
    if (!ampOnly) {
        const args = [command, '--name', name, '-y'];
        if (options.global !== false)
            args.push('-g');
        for (const agent of targetAgents.filter((a) => a !== 'amp'))
            args.push('-a', agent);
        const [cmd, ...prefix] = runner.split(' ');
        const { stdout } = await exec(cmd, [...prefix, 'add-mcp', ...args]);
        // Extract agent names from add-mcp output (lines like "│ ✓ Claude Code: ~/.claude.json │")
        agents.push(...stdout
            .split('\n')
            .filter((l) => l.includes('✓') || l.includes('✔'))
            .map((l) => l
            .replace(/[│┃|]/g, '')
            .replace(/.*[✓✔]\s*/, '')
            .replace(/:.*/, '')
            .trim())
            .filter(Boolean));
    }
    // Register with Amp directly (add-mcp doesn't support it)
    if (targetAgents.length === 0 || targetAgents.includes('amp')) {
        const registered = registerAmp(name, command);
        if (registered)
            agents.push('Amp');
    }
    return { command, agents };
}
/** @internal Registers an MCP server in Amp's settings.json. */
function registerAmp(name, command) {
    const configPath = join(homedir(), '.config', 'amp', 'settings.json');
    let config = {};
    if (existsSync(configPath)) {
        try {
            config = JSON.parse(readFileSync(configPath, 'utf-8'));
        }
        catch {
            return false;
        }
    }
    const [cmd, ...args] = command.split(' ');
    if (!cmd)
        return false;
    const servers = config['amp.mcpServers'] ?? {};
    servers[name] = { command: cmd, args };
    config['amp.mcpServers'] = servers;
    const dir = dirname(configPath);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return true;
}
/** @internal Detects the package specifier used to run this CLI (handles dlx/npx URL and version installs). */
export function detectPackageSpecifier(name) {
    const bin = process.argv[1];
    if (!bin)
        return name;
    const match = bin.match(/^(.+)[/\\]node_modules[/\\]/);
    if (!match)
        return name;
    try {
        const pkg = JSON.parse(readFileSync(join(match[1], 'package.json'), 'utf-8'));
        const deps = pkg.dependencies ?? {};
        const spec = deps[name];
        if (!spec || Object.keys(deps).length !== 1)
            return name;
        if (/^https?:\/\//.test(spec) || spec.startsWith('file:'))
            return spec;
        if (/^\d/.test(spec))
            return `${name}@${spec}`;
    }
    catch { }
    return name;
}
/** Promisified execFile with stderr in error message. */
function exec(cmd, args) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, (error, stdout, stderr) => {
            if (error) {
                const msg = stderr?.trim() || stdout?.trim() || error.message;
                reject(new Error(msg));
            }
            else
                resolve({ stdout, stderr });
        });
    });
}
//# sourceMappingURL=SyncMcp.js.map