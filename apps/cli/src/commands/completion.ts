import { Cli, z } from "incur";

const BASH_COMPLETION = `# codeplane bash completion
_codeplane() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="auth repo issue land change bookmark release workflow run workspace search label secret variable ssh-key config status completion agent org wiki notification webhook admin beta api"

  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    auth)
      COMPREPLY=( $(compgen -W "login logout status token" -- "\${cur}") )
      ;;
    repo)
      COMPREPLY=( $(compgen -W "create list view clone fork transfer archive unarchive" -- "\${cur}") )
      ;;
    issue)
      COMPREPLY=( $(compgen -W "create list view close reopen edit comment react pin lock link" -- "\${cur}") )
      ;;
    land)
      COMPREPLY=( $(compgen -W "create list view review checks conflicts land" -- "\${cur}") )
      ;;
    change)
      COMPREPLY=( $(compgen -W "list show diff" -- "\${cur}") )
      ;;
    bookmark)
      COMPREPLY=( $(compgen -W "list create delete" -- "\${cur}") )
      ;;
    release)
      COMPREPLY=( $(compgen -W "create list view delete upload" -- "\${cur}") )
      ;;
    workflow)
      COMPREPLY=( $(compgen -W "list dispatch" -- "\${cur}") )
      ;;
    run)
      COMPREPLY=( $(compgen -W "list view rerun" -- "\${cur}") )
      ;;
    workspace)
      COMPREPLY=( $(compgen -W "create list view delete ssh fork snapshots" -- "\${cur}") )
      ;;
    search)
      COMPREPLY=( $(compgen -W "repos issues code" -- "\${cur}") )
      ;;
    label)
      COMPREPLY=( $(compgen -W "create list delete" -- "\${cur}") )
      ;;
    secret)
      COMPREPLY=( $(compgen -W "list set delete" -- "\${cur}") )
      ;;
    variable)
      COMPREPLY=( $(compgen -W "list get set delete" -- "\${cur}") )
      ;;
    ssh-key)
      COMPREPLY=( $(compgen -W "add list delete" -- "\${cur}") )
      ;;
    config)
      COMPREPLY=( $(compgen -W "get set list" -- "\${cur}") )
      ;;
    agent)
      COMPREPLY=( $(compgen -W "session list view run chat" -- "\${cur}") )
      ;;
    org)
      COMPREPLY=( $(compgen -W "create list view edit delete member team" -- "\${cur}") )
      ;;
    wiki)
      COMPREPLY=( $(compgen -W "list view create edit delete" -- "\${cur}") )
      ;;
    notification)
      COMPREPLY=( $(compgen -W "list read" -- "\${cur}") )
      ;;
    webhook)
      COMPREPLY=( $(compgen -W "create list view update delete deliveries" -- "\${cur}") )
      ;;
    admin)
      COMPREPLY=( $(compgen -W "user runner workflow health" -- "\${cur}") )
      ;;
    beta)
      COMPREPLY=( $(compgen -W "waitlist whitelist" -- "\${cur}") )
      ;;
  esac
  return 0
}
complete -F _codeplane codeplane`;

const ZSH_COMPLETION = `#compdef codeplane

_codeplane() {
  local -a commands
  commands=(
    'auth:Manage authentication'
    'repo:Manage repositories'
    'issue:Manage issues'
    'land:Manage landing requests'
    'change:View changes'
    'bookmark:Manage bookmarks'
    'release:Manage releases'
    'workflow:Manage workflows'
    'run:View workflow runs'
    'workspace:Manage workspaces'
    'search:Search repos, issues, code'
    'label:Manage labels'
    'secret:Manage secrets'
    'variable:Manage variables'
    'ssh-key:Manage SSH keys'
    'config:Get and set configuration'
    'status:Show working copy status'
    'completion:Generate shell completions'
    'agent:Talk to the Codeplane helper'
    'org:Organization management'
    'wiki:Manage wiki pages'
    'notification:Manage notifications'
    'webhook:Manage webhooks'
    'admin:Admin commands'
    'beta:Alpha/beta features'
    'api:Make raw API calls'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case "\${words[2]}" in
    auth) _values 'subcommand' 'login' 'logout' 'status' 'token' ;;
    repo) _values 'subcommand' 'create' 'list' 'view' 'clone' 'fork' 'transfer' 'archive' 'unarchive' ;;
    issue) _values 'subcommand' 'create' 'list' 'view' 'close' 'reopen' 'edit' 'comment' 'react' 'pin' 'lock' 'link' ;;
    land) _values 'subcommand' 'create' 'list' 'view' 'review' 'checks' 'conflicts' 'land' ;;
    change) _values 'subcommand' 'list' 'show' 'diff' ;;
    bookmark) _values 'subcommand' 'list' 'create' 'delete' ;;
    release) _values 'subcommand' 'create' 'list' 'view' 'delete' 'upload' ;;
    workflow) _values 'subcommand' 'list' 'dispatch' ;;
    run) _values 'subcommand' 'list' 'view' 'rerun' ;;
    workspace) _values 'subcommand' 'create' 'list' 'view' 'delete' 'ssh' 'fork' 'snapshots' ;;
    search) _values 'subcommand' 'repos' 'issues' 'code' ;;
    label) _values 'subcommand' 'create' 'list' 'delete' ;;
    secret) _values 'subcommand' 'list' 'set' 'delete' ;;
    variable) _values 'subcommand' 'list' 'get' 'set' 'delete' ;;
    ssh-key) _values 'subcommand' 'add' 'list' 'delete' ;;
    config) _values 'subcommand' 'get' 'set' 'list' ;;
    agent) _values 'subcommand' 'session' 'list' 'view' 'run' 'chat' ;;
    org) _values 'subcommand' 'create' 'list' 'view' 'edit' 'delete' 'member' 'team' ;;
    wiki) _values 'subcommand' 'list' 'view' 'create' 'edit' 'delete' ;;
    notification) _values 'subcommand' 'list' 'read' ;;
    webhook) _values 'subcommand' 'create' 'list' 'view' 'update' 'delete' 'deliveries' ;;
    admin) _values 'subcommand' 'user' 'runner' 'workflow' 'health' ;;
    beta) _values 'subcommand' 'waitlist' 'whitelist' ;;
  esac
}

_codeplane`;

const FISH_COMPLETION = `# codeplane fish completions
set -l commands auth repo issue land change bookmark release workflow run workspace search label secret variable ssh-key config status completion agent org wiki notification webhook admin beta api

complete -c codeplane -f
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a auth -d "Manage authentication"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a repo -d "Manage repositories"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a issue -d "Manage issues"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a land -d "Manage landing requests"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a change -d "View changes"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a bookmark -d "Manage bookmarks"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a release -d "Manage releases"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a workflow -d "Manage workflows"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a run -d "View workflow runs"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a workspace -d "Manage workspaces"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a search -d "Search repos, issues, code"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a label -d "Manage labels"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a secret -d "Manage secrets"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a variable -d "Manage variables"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a ssh-key -d "Manage SSH keys"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a config -d "Get and set configuration"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a status -d "Show working copy status"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a completion -d "Generate shell completions"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a agent -d "Talk to the Codeplane helper"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a org -d "Organization management"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a wiki -d "Manage wiki pages"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a notification -d "Manage notifications"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a webhook -d "Manage webhooks"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a admin -d "Admin commands"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a beta -d "Alpha/beta features"
complete -c codeplane -n "not __fish_seen_subcommand_from $commands" -a api -d "Make raw API calls"

# auth subcommands
complete -c codeplane -n "__fish_seen_subcommand_from auth" -a "login logout status token"

# repo subcommands
complete -c codeplane -n "__fish_seen_subcommand_from repo" -a "create list view clone fork transfer archive unarchive"

# issue subcommands
complete -c codeplane -n "__fish_seen_subcommand_from issue" -a "create list view close reopen edit comment react pin lock link"

# land subcommands
complete -c codeplane -n "__fish_seen_subcommand_from land" -a "create list view review checks conflicts land"

# change subcommands
complete -c codeplane -n "__fish_seen_subcommand_from change" -a "list show diff"

# bookmark subcommands
complete -c codeplane -n "__fish_seen_subcommand_from bookmark" -a "list create delete"

# release subcommands
complete -c codeplane -n "__fish_seen_subcommand_from release" -a "create list view delete upload"

# workflow subcommands
complete -c codeplane -n "__fish_seen_subcommand_from workflow" -a "list dispatch"

# run subcommands
complete -c codeplane -n "__fish_seen_subcommand_from run" -a "list view rerun"

# workspace subcommands
complete -c codeplane -n "__fish_seen_subcommand_from workspace" -a "create list view delete ssh fork snapshots"

# search subcommands
complete -c codeplane -n "__fish_seen_subcommand_from search" -a "repos issues code"

# agent subcommands
complete -c codeplane -n "__fish_seen_subcommand_from agent" -a "session list view run chat"`;

export const completion = Cli.create("completion", {
  description: "Generate shell completions",
  args: z.object({
    shell: z.enum(["bash", "zsh", "fish"]).describe("Shell type"),
  }),
  async run(c) {
    const completions: Record<string, string> = {
      bash: BASH_COMPLETION,
      zsh: ZSH_COMPLETION,
      fish: FISH_COMPLETION,
    };
    process.stdout.write(completions[c.args.shell] + "\n");
    return undefined;
  },
});
