# Plan: Owner group pre-order (3 levels)

Base path: `backend/restaurant-backend-app/` (abbrev. `B/`), API project `B/dnapp/lambdas/api-handler/` (abbrev. `A/`).

## 1. What already exists (findings)

- Routing: `A/Routing/RouteRegistry.cs` (`GetGuestAndGroupRoutes()`), handlers created via `ActivatorUtilities`, services/repos registered as singletons in the same file.
- Layering: `Handlers/*` -> `Services/*` -> `Repositories/*` (DynamoDB `IDynamoDBContext`, table names via `ResourceNames`, `DynamoConfig`).
- Errors: services throw `ValidationException` (-> 400 via `ResponseBuilder.CreateErrorCodeResponse`), `GroupReservationNotFoundException` / `GuestSessionNotFoundException` / `ReservationNotFoundException` (handlers map to 404), `ActionForbiddenException` (403). Unmapped exceptions -> 500.
- There is **no "Owner" role** in `Roles` (Admin/Waiter/Customer). Existing code treats "owner" as `reservation.CustomerId == caller sub` (see `GuestSessionService.ValidateReservationOwnerAsync`). I will reuse that.
- **Level 3 is already partly implemented**: route `DELETE /guest/groups/{groupReservationId}/sessions/{guestSessionId}`, `DeleteGuestSessionHandler`, `GuestSessionService.DeleteGuestSessionAsync`, models `GetAllSessionsResponse` / `Participant`, and the deployment entry. Gaps: snapshot-building code is inline (not reusable), always labels participants `Guest`, `dishesById[...]` throws on a missing dish, and there are no tests.
- Docs/swagger/deployment are inconsistent:
  - `docs/ApiRoutes.md` has stale bodies for `GET .../sessions`, `POST /group-reservations/{id}/submit`, `DELETE .../sessions/{id}`; already lists `GET /reservations/{id}/guest-session-id`.
  - `swagger-endpoints.yaml` documents the submit as `/guest/groups/{id}/submit` (spec says `/group-reservations/{id}/submit`); already has `guest-session-id` and `SubmitGroupPreOrderRequest`.
  - `B/deployment_resources.json` (API Gateway) has only the DELETE route; the other three routes are missing.
- IAM (`lambda-basic-execution`) already allows `PutItem`/`UpdateItem`/`DeleteItem`/`GetItem`/`Query`, enough for `TransactWriteItems`. No IAM change needed.
- SDK `AWSSDK.DynamoDBv2 4.0.1.5` supports `IDynamoDBContext.CreateTransactWrite<T>(...)` and `CreateMultiTableTransactWrite(...)`, so I can reuse entity mapping instead of hand-built `AttributeValue`s.
- Tests: xUnit + Moq + AutoFixture, service-level only (no handler tests), in `B/Tests/Services/`. `GuestSessionServiceTests` and `GroupReservationServiceTests` build the service with mocked repos.
- Not wired: `GuestSessionService.CreateGroupOwnerSessionAsync` exists but is not on the interface and has no caller, so owner sessions may not exist in data. See open questions.

## 2. Design

### Level 1 - `GET /guest/groups/{groupReservationId}/sessions`
- `IGuestSessionService.GetGroupSnapshotAsync(string userId, string groupReservationId)` -> `GetAllSessionsResponse`:
  owner check (reuse `ValidateReservationOwnerAsync`), load sessions via `GetAllByGroupReservationIdAsync`, then private `BuildSnapshotAsync(sessions)` (batch-load dishes with `GetDishesByIdsAsync`, per-participant total = sum(price*quantity), overall = sum of totals).
- `DeleteGuestSessionAsync` is refactored to call the same `BuildSnapshotAsync` (Level 3 reuse).
- New handler `Handlers/GuestSessions/GetGroupSessionsHandler.cs` (same shape as `DeleteGuestSessionHandler`: path param, `sub` claim, 404/403/400 mapping).

### Level 2a - `GET /reservations/{reservationId}/guest-session-id`
- `IGuestSessionService.GetOwnerGuestSessionIdAsync(string userId, string reservationId)` -> new `OwnerGuestSessionIdResponse(string GuestSessionId)`.
  Reservation missing -> 404; `CustomerId != userId` -> 403; group reservation missing -> 404; owner session (`IsOwnerSession`) found among `GetAllByGroupReservationIdAsync(group.GroupReservationId)`.
- New handler `GetOwnerGuestSessionIdHandler.cs`.

### Level 2b - `POST /group-reservations/{groupReservationId}/submit`
- `IGroupReservationService.SubmitGroupPreOrderAsync(userId, groupReservationId, reservationId)` -> `List<SubmittedDishResponse>` (`dishId`, `quantity`). `GroupReservationService` gets `IOrderRepository` injected.
- All validation before any write, in this order: group found (404) -> reservation found (404) -> caller is owner (403) -> body `reservationId` matches group (400) -> submitted sessions exist (400) -> at least one dish (400) -> active order found (400).
- Merge dishes by `dishId` (sum quantity), add into the order (merge with existing order lines by `dishId`, new lines `Pending`), set `Order.Status = SubmittedByCustomer`, `GroupReservation.Status = Submitted`.
- Atomic write: new `IGroupReservationRepository.SubmitAsync(GroupReservation group, Order order)` implemented with `context.CreateMultiTableTransactWrite(CreateTransactWrite<Order>(cfg).AddSaveItem(order), CreateTransactWrite<GroupReservation>(cfg).AddSaveItem(group))` with `OverrideTableName` per table. Verify at compile time that `TransactWriteConfig` supports `OverrideTableName`; fall back to building `TransactWriteItems` on `IAmazonDynamoDB` if not.
- New handler `Handlers/GroupReservations/SubmitGroupReservationHandler.cs`, body parsed with `RequestBodyHelper.TryParseAndValidate`.

### Level 3 - `DELETE /guest/groups/{groupReservationId}/sessions/{guestSessionId}`
- Keep route/handler. Order of checks: owner (403/404) -> session not found 404 -> wrong group 400 -> delete -> return `BuildSnapshotAsync`. Make the response camelCase JSON via `CreateJsonResponse` (consistent with Level 1) instead of `CreateSuccessResponse`. Tests added.

## 3. Files

### Add
| File | Purpose |
|---|---|
| `A/Handlers/GuestSessions/GetGroupSessionsHandler.cs` | L1 handler |
| `A/Handlers/GuestSessions/GetOwnerGuestSessionIdHandler.cs` | L2a handler |
| `A/Handlers/GroupReservations/SubmitGroupReservationHandler.cs` | L2b handler |
| `A/Models/GuestSessions/OwnerGuestSessionIdResponse.cs` | L2a response |
| `A/Models/GroupReservation/SubmitGroupReservationRequest.cs` | L2b request (`[Required] ReservationId`) |
| `A/Models/GroupReservation/SubmittedDishResponse.cs` | L2b response item |

### Change
| File | Change |
|---|---|
| `A/Services/GuestSessions/IGuestSessionService.cs`, `GuestSessionService.cs` | add `GetGroupSnapshotAsync`, `GetOwnerGuestSessionIdAsync`; extract `BuildSnapshotAsync`; refactor delete; null-safe dish lookup |
| `A/Services/GroupReservations/IGroupReservationService.cs`, `GroupReservationService.cs` | add `SubmitGroupPreOrderAsync`; inject `IOrderRepository` |
| `A/Repositories/GroupReservations/IGroupReservationRepository.cs`, `GroupReservationRepository.cs` | add transactional `SubmitAsync` |
| `A/Handlers/GuestSessions/DeleteGuestSessionHandler.cs` | camelCase JSON response |
| `A/Routing/RouteRegistry.cs` | register 3 routes in `GetGuestAndGroupRoutes()` |
| `B/deployment_resources.json` | API Gateway entries for the 3 new paths (`cognito_authorizer`, lambda `api-handler`, CORS), same as `/reservations/{reservationId}/invite-token` |
| `B/docs/ApiRoutes.md` | rewrite entries for the 4 endpoints (responses, errors) |
| `B/swagger_src/swagger-ui/swagger-endpoints.yaml` | fix submit path to `/group-reservations/{id}/submit`; add schemas/responses (403/404) for the 4 endpoints |
| `B/Tests/Services/GuestSessionServiceTests.cs` | new tests (below) |
| `B/Tests/Services/GroupReservationServiceTests.cs` | add `IOrderRepository` mock to ctor; new submit tests |

`CHANGELOG.md` is an untouched template, so I will leave it alone.

## 4. Tests (service level, existing style)
- Snapshot: happy path (per-participant and overall totals, `isSubmitted`), group not found 404, not owner 403, empty group -> total 0.
- Owner session id: happy path, reservation not found, not owner, group not found, owner session missing.
- Submit: happy path (merge by `dishId`, order -> `SubmittedByCustomer`, group -> `Submitted`, single `SubmitAsync` call, only submitted sessions counted), reservation not found, group not found, not owner, reservation/group mismatch, no submitted sessions, submitted sessions without dishes, order not found; in each error case `SubmitAsync` is never called.
- Delete: happy path returns updated snapshot, not owner, group not found, session not found, session in another group -> 400, and no delete call on errors.

## 5. Open questions (please answer or confirm defaults)
1. **"Owner"** = reservation `CustomerId == caller sub` (no Owner role exists). OK?
2. **Owner session may not exist**: `CreateGroupOwnerSessionAsync` has no caller. For `guest-session-id` when none exists, default: return 404. Alternative: create it lazily (needs a new interface method). Which?
3. **Owner's session in snapshot**: default: included as `type: "Owner"`, name = user's `given_name` (as `GetGuestSessionInfoAsync` does). Alternative: guests only. Which?
4. **Deleting the owner's own session** in Level 3: default: reject with 400. OK?
5. **"Add to the order"**: default: merge into existing order lines by `dishId`, summing quantities. Alternative: replace order dishes. Which?
6. **Re-submit protection** (not in your rules): default: if the group is already `Submitted`/`Closed`, return 400 to avoid doubling quantities. OK?
7. **Reservation/group mismatch** (body `reservationId` != group's): default: 400. OK?

No code will be written until you approve.
