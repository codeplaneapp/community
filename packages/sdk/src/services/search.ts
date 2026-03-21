import type { Sql } from "postgres";
import { Result, TaggedError } from "better-result";

import {
  APIError,
  internal,
  validationFailed,
} from "../lib/errors";
import type { AuthUser } from "../lib/context";

import {
  searchRepositoriesFTS,
  countSearchRepositoriesFTS,
  searchIssuesFTS,
  countSearchIssuesFTS,
  searchCodeFTS,
  countSearchCodeFTS,
  searchUsersFTS,
  countSearchUsersFTS,
} from "../db/search_sql";

// ---------------------------------------------------------------------------
// Constants — match Go's search service constants
// ---------------------------------------------------------------------------

const searchDefaultPage = 1;
const searchDefaultPerPage = 30;
const searchMaxPerPage = 100;

// ---------------------------------------------------------------------------
// Input types — match Go's Search*Input structs
// ---------------------------------------------------------------------------

export interface SearchRepositoriesInput {
  query: string;
  page: number;
  perPage: number;
}

export interface SearchIssuesInput {
  query: string;
  state: string;
  label: string;
  assignee: string;
  milestone: string;
  page: number;
  perPage: number;
}

export interface SearchUsersInput {
  query: string;
  page: number;
  perPage: number;
}

export interface SearchCodeInput {
  query: string;
  page: number;
  perPage: number;
}

// ---------------------------------------------------------------------------
// Result types — match Go's *SearchResult and *SearchResultPage structs
// ---------------------------------------------------------------------------

export interface RepositorySearchResult {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  is_public: boolean;
  topics: string[];
}

export interface RepositorySearchResultPage {
  items: RepositorySearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface IssueSearchResult {
  id: string;
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  number: string;
  title: string;
  state: string;
}

export interface IssueSearchResultPage {
  items: IssueSearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface UserSearchResultPage {
  items: UserSearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface CodeSearchResult {
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  path: string;
  snippet: string;
}

export interface CodeSearchResultPage {
  items: CodeSearchResult[];
  total_count: number;
  page: number;
  per_page: number;
}

// ---------------------------------------------------------------------------
// Helpers — match Go's normalizeSearchPagination and searchViewerID
// ---------------------------------------------------------------------------

function normalizeSearchPagination(
  page: number,
  perPage: number,
): { page: number; perPage: number } {
  let resolvedPage = page;
  if (resolvedPage < 1) resolvedPage = 1;
  let resolvedPerPage = perPage;
  if (resolvedPerPage < 1) resolvedPerPage = searchDefaultPerPage;
  if (resolvedPerPage > searchMaxPerPage) resolvedPerPage = searchMaxPerPage;
  return { page: resolvedPage, perPage: resolvedPerPage };
}

function searchViewerID(viewer: AuthUser | undefined): string {
  if (!viewer) return "0";
  return String(viewer.id);
}

// ---------------------------------------------------------------------------
// SearchService — matches Go's SearchService 1:1
// ---------------------------------------------------------------------------

export class SearchService {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async searchRepositories(
    viewer: AuthUser | undefined,
    input: SearchRepositoriesInput,
  ): Promise<RepositorySearchResultPage> {
    const query = input.query.trim();
    if (query === "") {
      throw new APIError(422, "query required");
    }

    const { page, perPage } = normalizeSearchPagination(
      input.page,
      input.perPage,
    );
    const viewerId = searchViewerID(viewer);
    const pageOffset = (page - 1) * perPage;

    const countResult = await countSearchRepositoriesFTS(this.sql, {
      query,
      viewerId,
    });
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    if (total === 0) {
      return {
        items: [],
        total_count: 0,
        page,
        per_page: perPage,
      };
    }

    const rows = await searchRepositoriesFTS(this.sql, {
      query,
      viewerId,
      pageOffset,
      pageSize: perPage,
    });

    const items: RepositorySearchResult[] = rows.map((row) => ({
      id: row.id,
      owner: row.ownerName,
      name: row.name,
      full_name: `${row.ownerName}/${row.name}`,
      description: row.description,
      is_public: row.isPublic,
      topics: row.topics,
    }));

    return {
      items,
      total_count: total,
      page,
      per_page: perPage,
    };
  }

  async searchIssues(
    viewer: AuthUser | undefined,
    input: SearchIssuesInput,
  ): Promise<IssueSearchResultPage> {
    const query = input.query.trim();
    if (query === "") {
      throw new APIError(422, "query required");
    }

    const state = input.state.trim().toLowerCase();
    if (state !== "" && state !== "open" && state !== "closed") {
      throw new APIError(422, "invalid state filter");
    }
    const label = input.label.trim().toLowerCase();
    const assignee = input.assignee.trim().toLowerCase();
    const milestone = input.milestone.trim().toLowerCase();

    const { page, perPage } = normalizeSearchPagination(
      input.page,
      input.perPage,
    );
    const viewerId = searchViewerID(viewer);
    const pageOffset = (page - 1) * perPage;

    const countResult = await countSearchIssuesFTS(this.sql, {
      query,
      stateFilter: state,
      labelFilter: label,
      assigneeFilter: assignee,
      milestoneFilter: milestone,
      viewerId,
    });
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    if (total === 0) {
      return {
        items: [],
        total_count: 0,
        page,
        per_page: perPage,
      };
    }

    const rows = await searchIssuesFTS(this.sql, {
      query,
      stateFilter: state,
      labelFilter: label,
      assigneeFilter: assignee,
      milestoneFilter: milestone,
      viewerId,
      pageOffset,
      pageSize: perPage,
    });

    const items: IssueSearchResult[] = rows.map((row) => ({
      id: row.id,
      repository_id: row.repositoryId,
      repository_owner: row.ownerName,
      repository_name: row.repositoryName,
      number: row.number,
      title: row.title,
      state: row.state,
    }));

    return {
      items,
      total_count: total,
      page,
      per_page: perPage,
    };
  }

  async searchUsers(
    input: SearchUsersInput,
  ): Promise<UserSearchResultPage> {
    const query = input.query.trim();
    if (query === "") {
      throw new APIError(422, "query required");
    }

    const { page, perPage } = normalizeSearchPagination(
      input.page,
      input.perPage,
    );
    const pageOffset = (page - 1) * perPage;

    const countResult = await countSearchUsersFTS(this.sql, {
      query,
    });
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    if (total === 0) {
      return {
        items: [],
        total_count: 0,
        page,
        per_page: perPage,
      };
    }

    const rows = await searchUsersFTS(this.sql, {
      query,
      pageOffset,
      pageSize: perPage,
    });

    const items: UserSearchResult[] = rows.map((row) => ({
      id: row.id,
      username: row.username,
      display_name: row.displayName,
      avatar_url: row.avatarUrl,
    }));

    return {
      items,
      total_count: total,
      page,
      per_page: perPage,
    };
  }

  async searchCode(
    viewer: AuthUser | undefined,
    input: SearchCodeInput,
  ): Promise<CodeSearchResultPage> {
    const query = input.query.trim();
    if (query === "") {
      throw new APIError(422, "query required");
    }

    const { page, perPage } = normalizeSearchPagination(
      input.page,
      input.perPage,
    );
    const viewerId = searchViewerID(viewer);
    const pageOffset = (page - 1) * perPage;

    const countResult = await countSearchCodeFTS(this.sql, {
      query,
      viewerId,
    });
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    if (total === 0) {
      return {
        items: [],
        total_count: 0,
        page,
        per_page: perPage,
      };
    }

    const rows = await searchCodeFTS(this.sql, {
      query,
      viewerId,
      pageOffset,
      pageSize: perPage,
    });

    const items: CodeSearchResult[] = rows.map((row) => ({
      repository_id: row.repositoryId,
      repository_owner: row.ownerName,
      repository_name: row.repositoryName,
      path: row.filePath,
      snippet: String(row.snippet),
    }));

    return {
      items,
      total_count: total,
      page,
      per_page: perPage,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSearchService(sql: Sql): SearchService {
  return new SearchService(sql);
}

